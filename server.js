const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { URL, URLSearchParams } = require('url');

loadEnvFromFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5500);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'chaco-rates-cache.json');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const VISIT_DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000;
const OFFICIAL_HOST = 'www.justiciachaco.gov.ar';
const OFFICIAL_CALC_PATH = '/sistemas/calcula_tasas/calculadora_v2/';
const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX = 5;
const CONTACT_ROUTE_PATHS = new Set(['/api/contacto', '/api/contacto/', '/api/contact', '/api/contact/']);
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || SMTP_PORT === 465;
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const CONTACT_TO_EMAIL = String(process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER || '').trim();
const CONTACT_FROM_EMAIL = String(process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || '').trim();
const CONTACT_SUBJECT_PREFIX = String(process.env.CONTACT_SUBJECT_PREFIX || '[Web Juridico]').trim();
const contactRateBuckets = new Map();
let smtpTransporterPromise = null;
let visitsUpdateQueue = Promise.resolve();

function loadEnvFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  } catch (_error) {
    // Non-fatal: env vars can still come from the process.
  }
}

const KNOWN_RATE_IDS = {
  '06%': '13',
  '08%': '10',
  '24%': '3',
  '32%': '4',
  '36%': '5',
  '48%': '9',
  '56%': '11',
  PACTADA: '6',
  'SIN INTERESES': '8',
  'T. ACTIVA 30 DIAS BNA': '2',
  'T. ACTIVA 30 DIAS BNA X 1,5': '7',
  'T. ALIMENTOS ART.552 CCCN BCRA + T.A. BNA': '14',
  'T. PASIVA USO JUSTICIA BCRA': '1'
};

const FALLBACK_RATES = [
  { value: '13', label: '06%', annualRate: 6 },
  { value: '10', label: '08%', annualRate: 8 },
  { value: '3', label: '24%', annualRate: 24 },
  { value: '4', label: '32%', annualRate: 32 },
  { value: '5', label: '36%', annualRate: 36 },
  { value: '9', label: '48%', annualRate: 48 },
  { value: '11', label: '56%', annualRate: 56 },
  { value: '6', label: 'PACTADA', annualRate: null },
  { value: '8', label: 'SIN INTERESES', annualRate: 0 },
  { value: '2', label: 'T. ACTIVA 30 DIAS BNA', annualRate: null },
  { value: '7', label: 'T. ACTIVA 30 DIAS BNA X 1,5', annualRate: null },
  { value: '14', label: 'T. ALIMENTOS ART.552 CCCN BCRA + T.A. BNA', annualRate: null },
  { value: '1', label: 'T. PASIVA USO JUSTICIA BCRA', annualRate: null }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function cleanLabel(label) {
  return decodeHtmlEntities(label).replace(/\s+/g, ' ').trim();
}

function normalizeLabelKey(label) {
  return cleanLabel(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseAnnualRate(label) {
  const normalized = cleanLabel(label);
  const match = normalized.match(/(\d{1,3}(?:[.,]\d{1,4})?)\s*%/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function parseLocalizedNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatOfficialNumber(value, decimals) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const fixed = num.toFixed(decimals);
  const compact = fixed.replace(/\.?0+$/, '');
  return compact.replace('.', ',');
}

function normalizeRateItems(items) {
  const normalized = [];
  const seen = new Set();

  for (const item of items || []) {
    const label = cleanLabel(item && item.label);
    if (!label) continue;

    let value = cleanLabel(item && item.value);
    if (!/^\d+$/.test(value)) {
      const mapped = KNOWN_RATE_IDS[normalizeLabelKey(label)];
      value = mapped || value;
    }

    if (!/^\d+$/.test(value)) continue;

    let annualRate = item && item.annualRate;
    if (annualRate === '' || annualRate === undefined) annualRate = null;
    if (annualRate === null) {
      annualRate = parseAnnualRate(label);
      if (annualRate === null && normalizeLabelKey(label) === 'SIN INTERESES') {
        annualRate = 0;
      }
    } else {
      annualRate = Number(annualRate);
      if (!Number.isFinite(annualRate)) annualRate = null;
    }

    const key = `${value}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      value,
      label,
      annualRate
    });
  }

  return normalized;
}

function parseRateOptionsFromHtml(html) {
  const blockedHints = [
    'Acción no Permitida',
    'Accion no Permitida',
    'Página Web Bloqueada',
    'Pagina Web Bloqueada'
  ];

  if (blockedHints.some((hint) => html.includes(hint))) {
    throw new Error('WAF_BLOCKED');
  }

  const selectMatch = html.match(
    /<select[^>]*(?:id\s*=\s*["'][^"']*id_tipo_tasa[^"']*["']|name\s*=\s*["']id_tipo_tasa["'])[^>]*>([\s\S]*?)<\/select>/i
  );

  if (!selectMatch) {
    throw new Error('RATE_SELECT_NOT_FOUND');
  }

  const optionRegex = /<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
  const items = [];
  let current = optionRegex.exec(selectMatch[1]);
  while (current) {
    items.push({
      value: cleanLabel(current[1]),
      label: cleanLabel(current[2]),
      annualRate: parseAnnualRate(current[2])
    });
    current = optionRegex.exec(selectMatch[1]);
  }

  return normalizeRateItems(items);
}

function requestOfficialPage({ method, path: requestPath, body, cookieHeader }) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'close'
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: OFFICIAL_HOST,
        path: requestPath,
        method,
        family: 4,
        timeout: 25000,
        headers
      },
      (res) => {
        let raw = '';
        res.setEncoding('latin1');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers || {},
            body: raw
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function extractFieldValue(html, fieldName) {
  const pattern = new RegExp(`name=["']${fieldName}["']\\s+value=["']([^"']*)`, 'i');
  const match = html.match(pattern);
  return match ? cleanLabel(match[1]) : '';
}

function extractCookieHeader(headers) {
  const setCookie = Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [];
  return setCookie.map((cookieLine) => String(cookieLine).split(';')[0]).join('; ');
}

function toOfficialDate(dateLike) {
  const raw = String(dateLike || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(raw)) {
    return raw.replace(/\//g, '-');
  }
  return '';
}

function parseCalculationResult(html) {
  const match = html.match(/<textarea[^>]*name=["']resultados["'][^>]*>([\s\S]*?)<\/textarea>/i);
  const rawText = decodeHtmlEntities((match && match[1]) || '')
    .replace(/\r/g, '')
    .replace(/\n\s+/g, '\n')
    .trim();

  if (!rawText) {
    throw new Error('OFFICIAL_RESULT_EMPTY');
  }

  const rateMatch = rawText.match(/Tasa:\s*([-\d.,]+)\s*%/i);
  const interestMatch = rawText.match(/Intereses:\s*\$\s*([-\d.,]+)/i);
  const daysMatch = rawText.match(/D[ií]as(?:\s+del\s+Per[ií]odo)?\s+calculado:\s*(\d+)/i);
  const totalMatch = rawText.match(/Total\s*\([^)]+\):\s*\$\s*([-\d.,]+)/i);

  return {
    text: rawText,
    parsed: {
      ratePct: rateMatch ? parseLocalizedNumber(rateMatch[1]) : null,
      interest: interestMatch ? parseLocalizedNumber(interestMatch[1]) : null,
      days: daysMatch ? Number(daysMatch[1]) : null,
      total: totalMatch ? parseLocalizedNumber(totalMatch[1]) : null
    }
  };
}

async function fetchOfficialRates() {
  const response = await requestOfficialPage({
    method: 'GET',
    path: OFFICIAL_CALC_PATH
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP_${response.statusCode}`);
  }

  const items = parseRateOptionsFromHtml(response.body || '');
  if (!items.length) {
    throw new Error('EMPTY_PARSE');
  }
  return items;
}

async function calculateOfficialChaco({
  importe,
  idTipoTasa,
  desde,
  hasta,
  tasaPactada
}) {
  const amount = Number(importe);
  const rateTypeId = String(idTipoTasa || '').trim();
  const fromDate = toOfficialDate(desde);
  const toDate = toOfficialDate(hasta);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('MONTO_INVALIDO');
  }
  if (!/^\d+$/.test(rateTypeId)) {
    throw new Error('TIPO_TASA_INVALIDO');
  }
  if (!fromDate || !toDate) {
    throw new Error('FECHA_INVALIDA');
  }

  const sessionResponse = await requestOfficialPage({
    method: 'GET',
    path: OFFICIAL_CALC_PATH
  });

  if (sessionResponse.statusCode < 200 || sessionResponse.statusCode >= 300) {
    throw new Error(`HTTP_${sessionResponse.statusCode}`);
  }

  const scriptCaseInit = extractFieldValue(sessionResponse.body, 'script_case_init');
  const csrfToken = extractFieldValue(sessionResponse.body, 'csrf_token');
  const cookieHeader = extractCookieHeader(sessionResponse.headers);

  if (!scriptCaseInit || !csrfToken || !cookieHeader) {
    throw new Error('OFFICIAL_SESSION_INVALID');
  }

  const form = new URLSearchParams();
  form.set('nm_form_submit', '1');
  form.set('nmgp_idioma_novo', '');
  form.set('nmgp_schema_f', '');
  form.set('nmgp_url_saida', '');
  form.set('bok', 'OK');
  form.set('nmgp_opcao', 'alterar');
  form.set('nmgp_ancora', '');
  form.set('nmgp_num_form', '');
  form.set('nmgp_parms', '');
  form.set('script_case_init', scriptCaseInit);
  form.set('NM_cancel_return_new', '');
  form.set('csrf_token', csrfToken);
  form.set('_sc_force_mobile', '');
  form.set('importe', formatOfficialNumber(amount, 2));
  form.set('id_tipo_tasa', rateTypeId);
  form.set('desde', fromDate);
  form.set('hasta', toDate);

  if (rateTypeId === '6') {
    const pactada = Number(tasaPactada);
    if (!Number.isFinite(pactada) || pactada <= 0) {
      throw new Error('TASA_PACTADA_INVALIDA');
    }
    form.set('tasa_pactada', formatOfficialNumber(pactada, 4));
  } else {
    form.set('tasa_pactada', '');
  }
  form.set('resultados', '');

  const postResponse = await requestOfficialPage({
    method: 'POST',
    path: OFFICIAL_CALC_PATH,
    body: form.toString(),
    cookieHeader
  });

  if (postResponse.statusCode < 200 || postResponse.statusCode >= 300) {
    throw new Error(`HTTP_${postResponse.statusCode}`);
  }

  const result = parseCalculationResult(postResponse.body || '');
  return {
    ok: true,
    source: 'official_engine',
    updatedAt: new Date().toISOString(),
    ...result
  };
}

function loadCacheFile() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.updatedAt) return null;
    const normalizedItems = normalizeRateItems(parsed.items);
    if (!normalizedItems.length) return null;
    return {
      ...parsed,
      items: normalizedItems
    };
  } catch (_error) {
    return null;
  }
}

function saveCacheFile(payload) {
  try {
    ensureDataDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_error) {
    // Non-fatal: API still returns data.
  }
}

async function getRatesPayload() {
  const now = Date.now();
  const cache = loadCacheFile();

  if (cache) {
    const age = now - new Date(cache.updatedAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) {
      return {
        ok: true,
        source: 'cache',
        updatedAt: cache.updatedAt,
        items: cache.items,
        note: 'Tasas desde caché local.'
      };
    }
  }

  try {
    const officialItems = await fetchOfficialRates();
    const payload = {
      ok: true,
      source: 'official',
      updatedAt: new Date().toISOString(),
      items: officialItems
    };
    saveCacheFile(payload);
    return payload;
  } catch (error) {
    if (cache) {
      return {
        ok: true,
        source: 'cache_fallback',
        updatedAt: cache.updatedAt,
        items: cache.items,
        note: `No se pudo refrescar tasas oficiales (${error.message}). Se usa caché previa.`
      };
    }
    return {
      ok: true,
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      items: FALLBACK_RATES,
      note: `No se pudo conectar al sitio oficial (${error.message}). Se usa lista base.`
    };
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('BODY_TOO_LARGE'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');
}

function createVisitorFingerprint(req) {
  const ip = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || '').trim().slice(0, 512);
  return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
}

function loadVisitsFile() {
  try {
    if (!fs.existsSync(VISITS_FILE)) {
      return {
        total: 0,
        updatedAt: null,
        recentVisitors: {}
      };
    }

    const raw = fs.readFileSync(VISITS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const total = Number(parsed && parsed.total);
    const updatedAt = parsed && parsed.updatedAt ? new Date(parsed.updatedAt).toISOString() : null;
    const recentVisitors = parsed && parsed.recentVisitors && typeof parsed.recentVisitors === 'object'
      ? parsed.recentVisitors
      : {};

    return {
      total: Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0,
      updatedAt,
      recentVisitors
    };
  } catch (_error) {
    return {
      total: 0,
      updatedAt: null,
      recentVisitors: {}
    };
  }
}

function cleanupRecentVisitors(recentVisitors, nowMs) {
  const cleaned = {};

  for (const [fingerprint, lastSeen] of Object.entries(recentVisitors || {})) {
    const stamp = Number(lastSeen);
    if (!Number.isFinite(stamp)) continue;
    if (nowMs - stamp >= VISIT_DEDUPE_WINDOW_MS) continue;
    cleaned[fingerprint] = stamp;
  }

  return cleaned;
}

function saveVisitsFile(payload) {
  ensureDataDir();
  fs.writeFileSync(VISITS_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function updateVisitStats(req) {
  const task = visitsUpdateQueue.then(() => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const fingerprint = createVisitorFingerprint(req);
    const stats = loadVisitsFile();
    const recentVisitors = cleanupRecentVisitors(stats.recentVisitors, nowMs);
    const lastSeen = Number(recentVisitors[fingerprint]);
    const shouldIncrement = !Number.isFinite(lastSeen) || (nowMs - lastSeen) >= VISIT_DEDUPE_WINDOW_MS;
    const nextTotal = shouldIncrement ? stats.total + 1 : stats.total;

    recentVisitors[fingerprint] = nowMs;

    const payload = {
      total: nextTotal,
      updatedAt: nowIso,
      recentVisitors
    };

    saveVisitsFile(payload);

    return {
      ok: true,
      totalVisits: nextTotal,
      updatedAt: nowIso,
      countedVisit: shouldIncrement
    };
  });

  visitsUpdateQueue = task.catch(() => {});
  return task;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeSingleLine(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeMultiline(value, maxLength) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, maxLength);
}

function isEmailConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && CONTACT_TO_EMAIL && CONTACT_FROM_EMAIL);
}

function cleanupContactRateBuckets(nowMs) {
  for (const [ip, attempts] of contactRateBuckets.entries()) {
    const validAttempts = attempts.filter((stamp) => nowMs - stamp < CONTACT_RATE_LIMIT_WINDOW_MS);
    if (!validAttempts.length) {
      contactRateBuckets.delete(ip);
      continue;
    }
    contactRateBuckets.set(ip, validAttempts);
  }
}

function isContactRateLimited(ipAddress) {
  const nowMs = Date.now();
  cleanupContactRateBuckets(nowMs);

  const key = ipAddress || 'unknown';
  const attempts = contactRateBuckets.get(key) || [];
  if (attempts.length >= CONTACT_RATE_LIMIT_MAX) {
    return true;
  }

  attempts.push(nowMs);
  contactRateBuckets.set(key, attempts);
  return false;
}

function validateContactPayload(body) {
  const cleaned = {
    nombre: normalizeSingleLine(body && body.nombre, 120),
    email: normalizeSingleLine(body && body.email, 180).toLowerCase(),
    consulta: normalizeMultiline(body && body.consulta, 4000),
    website: normalizeSingleLine((body && (body.website || body._honey)) || '', 120)
  };

  const errors = [];

  if (cleaned.website) {
    return {
      isSpam: true,
      cleaned,
      errors
    };
  }

  if (cleaned.nombre.length < 2) {
    errors.push('Ingrese un nombre valido (minimo 2 caracteres).');
  }
  if (!isValidEmail(cleaned.email)) {
    errors.push('Ingrese un correo valido.');
  }
  if (cleaned.consulta.length < 10) {
    errors.push('La consulta debe tener al menos 10 caracteres.');
  }

  return {
    isSpam: false,
    cleaned,
    errors
  };
}

async function getSmtpTransporter() {
  if (smtpTransporterPromise) {
    return smtpTransporterPromise;
  }

  if (!isEmailConfigured()) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  smtpTransporterPromise = (async () => {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
    await transporter.verify();
    return transporter;
  })();

  try {
    return await smtpTransporterPromise;
  } catch (error) {
    smtpTransporterPromise = null;
    throw error;
  }
}

async function sendContactEmail({ nombre, email, consulta }, meta) {
  const transporter = await getSmtpTransporter();
  const subject = `${CONTACT_SUBJECT_PREFIX} Nueva consulta de ${nombre}`;
  const ip = escapeHtml((meta && meta.ip) || 'unknown');
  const userAgent = escapeHtml((meta && meta.userAgent) || 'unknown');
  const receivedAt = new Date().toISOString();

  const text = [
    'Nueva consulta desde la web',
    '',
    `Nombre: ${nombre}`,
    `Email: ${email}`,
    `IP: ${ip}`,
    `User-Agent: ${userAgent}`,
    `Fecha: ${receivedAt}`,
    '',
    'Consulta:',
    consulta
  ].join('\n');

  const html = [
    '<h2>Nueva consulta desde la web</h2>',
    `<p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
    `<p><strong>IP:</strong> ${ip}</p>`,
    `<p><strong>User-Agent:</strong> ${userAgent}</p>`,
    `<p><strong>Fecha:</strong> ${escapeHtml(receivedAt)}</p>`,
    '<hr/>',
    '<p><strong>Consulta:</strong></p>',
    `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;">${escapeHtml(consulta)}</pre>`
  ].join('');

  const info = await transporter.sendMail({
    from: `"Web Juridico" <${CONTACT_FROM_EMAIL}>`,
    to: CONTACT_TO_EMAIL,
    replyTo: email,
    subject,
    text,
    html
  });

  return info;
}

async function handleContactRequest(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, {
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Metodo no permitido'
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const badRequest = error && (error.message === 'INVALID_JSON' || error.message === 'BODY_TOO_LARGE');
    sendJson(res, badRequest ? 400 : 500, {
      ok: false,
      error: error.message || 'INVALID_REQUEST',
      message: 'No se pudo procesar la solicitud'
    });
    return;
  }

  const ip = getClientIp(req);
  if (isContactRateLimited(ip)) {
    sendJson(res, 429, {
      ok: false,
      error: 'RATE_LIMIT',
      message: 'Demasiados intentos. Espere unos minutos.'
    });
    return;
  }

  const validation = validateContactPayload(body);
  if (validation.isSpam) {
    sendJson(res, 200, {
      ok: true,
      message: 'Consulta enviada correctamente'
    });
    return;
  }

  if (validation.errors.length) {
    sendJson(res, 400, {
      ok: false,
      error: 'VALIDATION_ERROR',
      message: validation.errors[0],
      issues: validation.errors
    });
    return;
  }

  try {
    const info = await sendContactEmail(validation.cleaned, {
      ip,
      userAgent: req.headers['user-agent']
    });
    sendJson(res, 200, {
      ok: true,
      message: 'Consulta enviada. Le responderemos pronto.',
      messageId: info && info.messageId ? info.messageId : null
    });
  } catch (error) {
    const knownConfigError = error && error.message === 'EMAIL_NOT_CONFIGURED';
    if (knownConfigError) {
      sendJson(res, 503, {
        ok: false,
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Servicio de correo no configurado en el servidor'
      });
      return;
    }

    console.error('CONTACT_EMAIL_ERROR', error && error.message ? error.message : error);
    sendJson(res, 502, {
      ok: false,
      error: 'EMAIL_SEND_FAILED',
      message: 'No se pudo enviar la consulta. Intente nuevamente.'
    });
  }
}

// Headers de seguridad comunes
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolvedPath = path.join(ROOT_DIR, safePath);
  if (!resolvedPath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (error, data) => {
    if (error) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = ['.html', '.json'].includes(ext)
      ? 'no-cache, must-revalidate'
      : 'public, max-age=86400'; // 1 día para assets estáticos
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': cacheControl
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      now: new Date().toISOString()
    });
    return;
  }

  if ((pathname === '/api/visitas' || pathname === '/api/visitas/') && req.method === 'GET') {
    try {
      const payload = await updateVisitStats(req);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error && error.message ? error.message : 'VISITS_COUNTER_FAILED'
      });
    }
    return;
  }

  if (CONTACT_ROUTE_PATHS.has(pathname)) {
    await handleContactRequest(req, res);
    return;
  }

  if ((pathname === '/api/tasas/chaco' || pathname === '/api/tasas/chaco/') && req.method === 'GET') {
    const payload = await getRatesPayload();
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === '/api/tasas/chaco/calcular' || pathname === '/api/tasas/chaco/calcular/') {
    if (req.method !== 'POST') {
      sendJson(res, 405, {
        ok: false,
        error: 'METHOD_NOT_ALLOWED'
      });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const result = await calculateOfficialChaco({
        importe: body.importe,
        idTipoTasa: body.idTipoTasa,
        desde: body.desde,
        hasta: body.hasta,
        tasaPactada: body.tasaPactada
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'OFFICIAL_CALC_FAILED'
      });
    }
    return;
  }

  serveStaticFile(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Servidor activo en http://127.0.0.1:${PORT}`);
  if (!isEmailConfigured()) {
    console.warn('Aviso: correo de contacto sin configurar. Defina SMTP_* y CONTACT_* en .env');
  }
});
