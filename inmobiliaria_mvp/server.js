const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5600);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PROPERTY_FILE = path.join(DATA_DIR, 'properties.json');
const INQUIRY_FILE = path.join(DATA_DIR, 'inquiries.json');
const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'inmo2026!').trim();
const SESSION_COOKIE = 'inmo_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const INQUIRY_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10;
const INQUIRY_RATE_LIMIT_MAX = 4;
const DUPLICATE_INQUIRY_WINDOW_MS = 1000 * 60 * 30;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const sessions = new Map();
const inquiryBuckets = new Map();
const inquiryFingerprints = new Map();

function loadEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (_error) {
    // env local no es obligatorio
  }
}

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
  }
}

function readJson(filePath, fallback) {
  try {
    ensureFile(filePath, fallback);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(filePath, payload) {
  ensureFile(filePath, Array.isArray(payload) ? [] : {});
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(text);
}

function readBody(req) {
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
    req.on('error', reject);
  });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const idx = item.indexOf('=');
      if (idx > 0) {
        cookies[item.slice(0, idx)] = item.slice(idx + 1);
      }
    });
  return cookies;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (!session || now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function getAuthenticatedSession(req) {
  cleanupSessions();
  const headerToken = String(req.headers['x-admin-token'] || '').trim();
  if (headerToken && sessions.has(headerToken)) {
    return sessions.get(headerToken) || null;
  }
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireAuth(req, res) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return null;
  }
  return session;
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, maxLength);
}

function cleanNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function cleanBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function normalizeAmenities(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 10);
  }
  return String(value || '')
    .split(',')
    .map((item) => cleanText(item, 60))
    .filter(Boolean)
    .slice(0, 10);
}

function normalizePropertyInput(body, existingId) {
  return {
    id: existingId,
    code: cleanText(body.code || `AI-${existingId}`, 30),
    title: cleanText(body.title, 120),
    type: cleanText(body.type, 40),
    operation: cleanText(body.operation, 30),
    city: cleanText(body.city, 50),
    zone: cleanText(body.zone, 60),
    address: cleanText(body.address, 120),
    price: cleanNumber(body.price, 0),
    currency: cleanText(body.currency || 'USD', 10),
    bedrooms: cleanNumber(body.bedrooms, 0),
    bathrooms: cleanNumber(body.bathrooms, 0),
    area: cleanNumber(body.area, 0),
    featured: cleanBoolean(body.featured),
    status: cleanText(body.status || 'active', 20),
    accent: cleanText(body.accent || 'sunrise', 20),
    tag: cleanText(body.tag, 40),
    summary: cleanText(body.summary, 220),
    description: cleanMultiline(body.description, 1400),
    amenities: normalizeAmenities(body.amenities)
  };
}

function validatePropertyInput(payload) {
  const issues = [];
  if (!payload.title) issues.push('Ingrese un titulo.');
  if (!payload.type) issues.push('Seleccione un tipo.');
  if (!payload.operation) issues.push('Seleccione una operacion.');
  if (!payload.city) issues.push('Ingrese una ciudad.');
  if (!payload.price || payload.price < 0) issues.push('Ingrese un precio valido.');
  return issues;
}

function filterProperties(items, searchParams) {
  const query = cleanText(searchParams.get('q'), 80).toLowerCase();
  const operation = cleanText(searchParams.get('operation'), 30).toLowerCase();
  const type = cleanText(searchParams.get('type'), 40).toLowerCase();
  const city = cleanText(searchParams.get('city'), 50).toLowerCase();
  const featured = searchParams.get('featured') === 'true';

  return items.filter((item) => {
    if (item.status !== 'active') return false;
    if (featured && !item.featured) return false;
    if (operation && String(item.operation || '').toLowerCase() !== operation) return false;
    if (type && String(item.type || '').toLowerCase() !== type) return false;
    if (city && String(item.city || '').toLowerCase() !== city) return false;
    if (query) {
      const haystack = [
        item.title,
        item.type,
        item.operation,
        item.city,
        item.zone,
        item.address,
        item.summary
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function cleanupInquiryBuckets(nowMs) {
  for (const [ip, stamps] of inquiryBuckets.entries()) {
    const fresh = stamps.filter((stamp) => nowMs - stamp < INQUIRY_RATE_LIMIT_WINDOW_MS);
    if (!fresh.length) {
      inquiryBuckets.delete(ip);
    } else {
      inquiryBuckets.set(ip, fresh);
    }
  }
}

function isInquiryRateLimited(ip) {
  const now = Date.now();
  cleanupInquiryBuckets(now);
  const attempts = inquiryBuckets.get(ip) || [];
  if (attempts.length >= INQUIRY_RATE_LIMIT_MAX) return true;
  attempts.push(now);
  inquiryBuckets.set(ip, attempts);
  return false;
}

function cleanupInquiryFingerprints(nowMs) {
  for (const [fingerprint, stamp] of inquiryFingerprints.entries()) {
    if (nowMs - stamp > DUPLICATE_INQUIRY_WINDOW_MS) {
      inquiryFingerprints.delete(fingerprint);
    }
  }
}

function buildInquiryFingerprint(payload) {
  return [
    payload.email,
    payload.phone,
    payload.city,
    payload.message.toLowerCase()
  ].join('|');
}

function normalizeInquiry(body, req) {
  return {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    status: 'new',
    source: cleanText(body.source || 'contacto', 30),
    propertyId: cleanNumber(body.propertyId, 0),
    name: cleanText(body.name, 90),
    email: cleanText(body.email, 140).toLowerCase(),
    phone: cleanText(body.phone, 40),
    city: cleanText(body.city, 80),
    message: cleanMultiline(body.message, 2000),
    website: cleanText(body.website, 120),
    ip: getClientIp(req),
    userAgent: cleanText(req.headers['user-agent'], 300)
  };
}

function validateInquiry(payload) {
  const issues = [];
  if (payload.website) {
    return ['SPAM'];
  }
  if (payload.name.length < 2) issues.push('Ingrese un nombre valido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) issues.push('Ingrese un correo valido.');
  if (payload.message.length < 10) issues.push('Ingrese una consulta mas completa.');
  return issues;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=600'
    });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  let safePath = pathname;
  if (safePath === '/') safePath = '/index.html';
  if (safePath === '/admin' || safePath === '/admin/') safePath = '/admin/index.html';
  const resolved = path.join(PUBLIC_DIR, safePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  serveFile(res, resolved);
}

async function handleAdminLogin(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }
  const username = cleanText(body.username, 60);
  const password = String(body.password || '');
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    sendJson(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });
    return;
  }

  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, {
    username,
    createdAt: Date.now()
  });

  sendJson(
    res,
    200,
    {
      ok: true,
      username,
      token: sessionId
    },
    {
      'Set-Cookie': `${SESSION_COOKIE}=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    }
  );
}

function handleAdminLogout(res) {
  sendJson(
    res,
    200,
    { ok: true },
    {
      'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    }
  );
}

async function handleCreateProperty(req, res) {
  if (!requireAuth(req, res)) return;
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }
  const items = readJson(PROPERTY_FILE, []);
  const nextId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const payload = normalizePropertyInput(body, nextId);
  const issues = validatePropertyInput(payload);
  if (issues.length) {
    sendJson(res, 400, { ok: false, issues });
    return;
  }
  items.push(payload);
  writeJson(PROPERTY_FILE, items);
  sendJson(res, 201, { ok: true, item: payload });
}

async function handleUpdateProperty(req, res, propertyId) {
  if (!requireAuth(req, res)) return;
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }
  const items = readJson(PROPERTY_FILE, []);
  const index = items.findIndex((item) => Number(item.id) === propertyId);
  if (index === -1) {
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }
  const payload = normalizePropertyInput(body, propertyId);
  const issues = validatePropertyInput(payload);
  if (issues.length) {
    sendJson(res, 400, { ok: false, issues });
    return;
  }
  items[index] = payload;
  writeJson(PROPERTY_FILE, items);
  sendJson(res, 200, { ok: true, item: payload });
}

function handleDeleteProperty(req, res, propertyId) {
  if (!requireAuth(req, res)) return;
  const items = readJson(PROPERTY_FILE, []);
  const filtered = items.filter((item) => Number(item.id) !== propertyId);
  if (filtered.length === items.length) {
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }
  writeJson(PROPERTY_FILE, filtered);
  sendJson(res, 200, { ok: true });
}

async function handleInquiryCreate(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }

  const ip = getClientIp(req);
  if (isInquiryRateLimited(ip)) {
    sendJson(res, 429, { ok: false, message: 'Demasiados intentos. Espere unos minutos.' });
    return;
  }

  const payload = normalizeInquiry(body, req);
  const issues = validateInquiry(payload);
  if (issues.length) {
    if (issues[0] === 'SPAM') {
      sendJson(res, 200, { ok: true, message: 'Consulta recibida.' });
      return;
    }
    sendJson(res, 400, { ok: false, issues });
    return;
  }

  const now = Date.now();
  cleanupInquiryFingerprints(now);
  const fingerprint = buildInquiryFingerprint(payload);
  if (inquiryFingerprints.has(fingerprint)) {
    sendJson(res, 200, { ok: true, message: 'Consulta recibida.' });
    return;
  }
  inquiryFingerprints.set(fingerprint, now);

  const inquiries = readJson(INQUIRY_FILE, []);
  inquiries.unshift(payload);
  writeJson(INQUIRY_FILE, inquiries);
  sendJson(res, 201, { ok: true, message: 'Consulta enviada. Le responderemos pronto.' });
}

async function handleInquiryUpdate(req, res, inquiryId) {
  if (!requireAuth(req, res)) return;
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }
  const nextStatus = cleanText(body.status, 20);
  const validStatuses = new Set(['new', 'read', 'answered', 'spam']);
  if (!validStatuses.has(nextStatus)) {
    sendJson(res, 400, { ok: false, error: 'INVALID_STATUS' });
    return;
  }
  const inquiries = readJson(INQUIRY_FILE, []);
  const index = inquiries.findIndex((item) => Number(item.id) === inquiryId);
  if (index === -1) {
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }
  inquiries[index].status = nextStatus;
  inquiries[index].updatedAt = new Date().toISOString();
  writeJson(INQUIRY_FILE, inquiries);
  sendJson(res, 200, { ok: true, item: inquiries[index] });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (pathname === '/api/properties' && req.method === 'GET') {
    const items = readJson(PROPERTY_FILE, []);
    const filtered = filterProperties(items, requestUrl.searchParams);
    sendJson(res, 200, { ok: true, items: filtered });
    return;
  }

  if (pathname === '/api/contact' && req.method === 'POST') {
    await handleInquiryCreate(req, res);
    return;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    await handleAdminLogin(req, res);
    return;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    handleAdminLogout(res);
    return;
  }

  if (pathname === '/api/admin/session' && req.method === 'GET') {
    const session = getAuthenticatedSession(req);
    sendJson(res, 200, {
      ok: true,
      authenticated: Boolean(session),
      username: session ? session.username : null
    });
    return;
  }

  if (pathname === '/api/admin/properties' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, { ok: true, items: readJson(PROPERTY_FILE, []) });
    return;
  }

  if (pathname === '/api/admin/properties' && req.method === 'POST') {
    await handleCreateProperty(req, res);
    return;
  }

  if (pathname === '/api/admin/inquiries' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, { ok: true, items: readJson(INQUIRY_FILE, []) });
    return;
  }

  const propertyMatch = pathname.match(/^\/api\/admin\/properties\/(\d+)$/);
  if (propertyMatch) {
    const propertyId = Number(propertyMatch[1]);
    if (req.method === 'PUT') {
      await handleUpdateProperty(req, res, propertyId);
      return;
    }
    if (req.method === 'DELETE') {
      handleDeleteProperty(req, res, propertyId);
      return;
    }
  }

  const inquiryMatch = pathname.match(/^\/api\/admin\/inquiries\/(\d+)$/);
  if (inquiryMatch && req.method === 'PATCH') {
    await handleInquiryUpdate(req, res, Number(inquiryMatch[1]));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  serveStatic(req, res, pathname);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`MVP inmobiliario activo en http://127.0.0.1:${PORT}`);
  });
}

module.exports = server;
