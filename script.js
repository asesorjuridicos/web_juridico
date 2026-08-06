﻿/* ============================================================
   ESTUDIO JURIDICO - SCRIPT.JS
   Logica: Header scroll, reveal animations, diagnostico 3 pasos,
   menu mobile, formulario de contacto.
   ============================================================ */

// ===== CONSTANTS =====
const WA_LINK = 'https://wa.me/543644388960?text=Hola%2C%20quisiera%20agendar%20una%20consulta%20confidencial%20sobre%20mi%20caso.';
const MAX_HONORARIOS_PERCENT = 100;

// ===== FOOTER YEAR =====
document.getElementById('currentYear').textContent = new Date().getFullYear();

function formatIntegerAr(value) {
  var amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat('es-AR').format(amount);
  } catch (_error) {
    return String(amount);
  }
}

function setVisitCounterText(text, isError) {
  var counter = document.getElementById('visitCounterValue');
  if (!counter) return;
  counter.textContent = text;
  counter.style.color = isError ? '#f1b4b4' : '';
}

function initVisitCounter() {
  var counter = document.getElementById('visitCounterValue');
  if (!counter) return;

  if (window.location.protocol === 'file:') {
    setVisitCounterText('Solo con servidor local', false);
    return;
  }

  fetch('/api/visitas', {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Accept': 'application/json'
    }
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) {
          return { ok: res.ok, data: data || {} };
        });
    })
    .then(function (result) {
      if (!result.ok || result.data.ok === false) {
        throw new Error('VISIT_COUNTER_FAILED');
      }
      setVisitCounterText(formatIntegerAr(result.data.totalVisits || 0), false);
    })
    .catch(function () {
      setVisitCounterText('No disponible', true);
    });
}

// ===== HEADER SCROLL =====
const header = document.getElementById('header');
const brandLogo = document.getElementById('brandLogo');
const fallbackLogo = brandLogo ? (brandLogo.dataset.fallbackLogo || 'logo-removebg-preview.png') : 'logo-removebg-preview.png';

function handleHeaderScroll() {
  const isScrolled = window.scrollY > 50;

  if (header) {
    header.classList.toggle('scrolled', isScrolled);
  }

  if (brandLogo) {
    const topLogo = brandLogo.dataset.topLogo || fallbackLogo;
    const scrollLogo = brandLogo.dataset.scrollLogo || fallbackLogo;
    brandLogo.src = isScrolled ? scrollLogo : topLogo;
  }
}

window.addEventListener('scroll', handleHeaderScroll, { passive: true });
handleHeaderScroll();

if (brandLogo) {
  brandLogo.addEventListener('error', function () {
    if (!brandLogo.src.includes(fallbackLogo)) {
      brandLogo.src = fallbackLogo;
    }
  });
}

// ===== MOBILE MENU =====
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileNav = document.getElementById('mobileNav');

mobileMenuBtn.addEventListener('click', function () {
  mobileNav.classList.toggle('open');
});

// Close mobile menu on link click
mobileNav.querySelectorAll('a').forEach(function (link) {
  link.addEventListener('click', function () {
    mobileNav.classList.remove('open');
  });
});

// Close mobile menu on outside click
document.addEventListener('click', function (e) {
  if (!mobileMenuBtn.contains(e.target) && !mobileNav.contains(e.target)) {
    mobileNav.classList.remove('open');
  }
});

// ===== SCROLL REVEAL =====
function initReveal() {
  var reveals = document.querySelectorAll('.reveal, .reveal-scale');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(function (el) {
    observer.observe(el);
  });
}

// Initialize reveal on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    initReveal();
    initOwlDoctor();
    initSideRobot();
  });
} else {
  initReveal();
  initOwlDoctor();
  initSideRobot();
}

// ===== HERO CALCULATOR =====
var FALLBACK_RATES = [
  { value: '13', label: '06%', annualRate: 6 },
  { value: '10', label: '08%', annualRate: 8 },
  { value: '3', label: '24%', annualRate: 24 },
  { value: '4', label: '32%', annualRate: 32 },
  { value: '5', label: '36%', annualRate: 36 },
  { value: '9', label: '48%', annualRate: 48 },
  { value: '11', label: '56%', annualRate: 56 },
  { value: '6', label: 'PACTADA', annualRate: null },
  { value: '2', label: 'T. ACTIVA 30 DIAS BNA', annualRate: null },
  { value: '7', label: 'T. ACTIVA 30 DIAS BNA X 1,5', annualRate: null },
  { value: '14', label: 'T. ALIMENTOS ART.552 CCCN BCRA + T.A. BNA', annualRate: null },
  { value: '15', label: 'T. INTERESES MORATORIOS (TIM) BCRA', annualRate: null },
  { value: '1', label: 'T. PASIVA USO JUSTICIA BCRA', annualRate: null }
];

var calculatorState = {
  mode: 'general',
  selectedRateType: 'custom',
  ratesLoaded: false,
  ratesSource: 'manual',
  isCalculating: false
};

function parseMoneyInput(inputId) {
  var el = document.getElementById(inputId);
  if (!el) return NaN;
  var raw = String(el.value || '').trim().replace(',', '.');
  if (raw === '') return 0;
  return Number(raw);
}

function formatCurrencyAr(value) {
  var amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (_e) {
    return '$ ' + amount.toFixed(2);
  }
}

// Función para animar el conteo de dinero
function animateCurrency(elementId, endValue, duration) {
  var obj = document.getElementById(elementId);
  if (!obj) return;
  
  var startTimestamp = null;
  var startValue = 0;
  
  var step = function(timestamp) {
    if (!startTimestamp) startTimestamp = timestamp;
    var progress = Math.min((timestamp - startTimestamp) / duration, 1);
    var currentVal = progress * (endValue - startValue) + startValue;
    
    obj.textContent = formatCurrencyAr(currentVal);
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  
  window.requestAnimationFrame(step);
}

function isOfficialRateValue(value) {
  return /^\d+$/.test(String(value || ''));
}

function renderCalculatorError(message) {
  var result = document.getElementById('heroCalcResult');
  if (!result) return;
  result.classList.add('error');
  result.textContent = message;
}

function setRatesNote(message, isError) {
  var note = document.getElementById('calcRatesNote');
  if (!note) return;
  note.textContent = message;
  note.classList.toggle('error', Boolean(isError));
}

function setCalculatorSubmitLoading(isLoading) {
  var btn = document.querySelector('#heroCalculatorForm .hero-calc-submit');
  if (!btn) return;
  btn.disabled = Boolean(isLoading);
  btn.textContent = isLoading ? 'Calculando...' : 'Calcular';
}

function applySelectedRateType() {
  var select = document.getElementById('calcRateType');
  var rateInput = document.getElementById('calcRate');
  if (!select || !rateInput) return;

  var option = select.options[select.selectedIndex];
  var selectedValue = option ? String(option.value || '') : 'custom';
  var selectedRate = option ? option.getAttribute('data-rate') : '';
  var selectedLabel = option ? option.textContent : 'Personalizada (manual)';
  var isOfficial = isOfficialRateValue(selectedValue);
  var isPactada = selectedValue === '6';
  var isVariableOfficial = isOfficial && (!selectedRate || selectedRate === '');

  calculatorState.selectedRateType = selectedValue;

  if (!isOfficial || selectedValue === 'custom') {
    rateInput.readOnly = false;
    rateInput.required = true;
    rateInput.placeholder = 'Ej: 65';
    setRatesNote('Modo manual activo. Puede escribir la tasa anual de sentencia.', false);
    return;
  }

  if (isPactada) {
    rateInput.readOnly = false;
    rateInput.required = true;
    rateInput.placeholder = 'Ej: 65,50';
    setRatesNote('Tipo oficial PACTADA. Ingrese la tasa anual pactada (%).', false);
    return;
  }

  rateInput.required = false;
  rateInput.readOnly = true;

  if (isVariableOfficial) {
    rateInput.value = '';
    rateInput.placeholder = 'Se calcula con la fuente oficial';
    setRatesNote('Tipo oficial variable seleccionado (' + selectedLabel + '). Se calcula directo en la fuente oficial.', false);
  } else {
    rateInput.value = selectedRate;
    rateInput.placeholder = 'Tasa oficial fija';
    setRatesNote('Tasa fija oficial aplicada: ' + selectedLabel + '.', false);
  }
}

function renderRateOptions(items) {
  var select = document.getElementById('calcRateType');
  if (!select) return;
  var previous = calculatorState.selectedRateType || 'custom';

  select.innerHTML = '<option value="custom">Personalizada (manual)</option>';

  if (Array.isArray(items)) {
    items.forEach(function (item) {
      if (!item || !item.label) return;
      var option = document.createElement('option');
      var optionValue = String(item.value || item.label);
      var isOfficial = isOfficialRateValue(optionValue);
      option.value = optionValue;
      option.textContent = item.label;
      option.setAttribute('data-official', isOfficial ? '1' : '0');
      if (item.annualRate !== null && item.annualRate !== undefined && item.annualRate !== '') {
        option.setAttribute('data-rate', String(item.annualRate));
        option.setAttribute('data-variable', '0');
      } else {
        option.setAttribute('data-rate', '');
        option.setAttribute('data-variable', '1');
      }
      select.appendChild(option);
    });
  }

  var exists = Array.from(select.options).some(function (opt) { return opt.value === previous; });
  select.value = exists ? previous : 'custom';
  applySelectedRateType();
}

function loadChacoRates() {
  setRatesNote('Tasas oficiales: actualizando...', false);

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var fetchTimer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

  function clearFetchTimer() {
    if (fetchTimer !== null) { clearTimeout(fetchTimer); fetchTimer = null; }
  }

  return fetch('/api/tasas/chaco', { cache: 'no-store', signal: controller ? controller.signal : undefined })
    .then(function (res) {
      clearFetchTimer();
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) {
          return {
            ok: res.ok,
            status: res.status,
            data: data || {}
          };
        });
    })
    .then(function (result) {
      var data = result.data || {};
      var backendItems = Array.isArray(data && data.items) ? data.items : [];
      var hasBackendItems = backendItems.length > 0;
      var items = hasBackendItems ? backendItems : FALLBACK_RATES;
      renderRateOptions(items);
      calculatorState.ratesLoaded = items.length > 0;
      calculatorState.ratesSource = hasBackendItems ? ((data && data.source) || 'manual') : 'fallback';

      var sourceLabel = '';
      if (!hasBackendItems) {
        sourceLabel = 'Lista base disponible (la API no devolvió tasas en este momento).';
      } else if (calculatorState.ratesSource === 'official') {
        sourceLabel = 'Fuente oficial Chaco (actualizada).';
      } else if (calculatorState.ratesSource === 'cache' || calculatorState.ratesSource === 'cache_fallback') {
        sourceLabel = 'Fuente oficial Chaco desde caché local.';
      } else {
        sourceLabel = 'Lista base disponible (sin conexión oficial en este momento).';
      }

      if (!result.ok || (data && data.ok === false)) {
        var backendError = (data && (data.error || data.message)) || ('HTTP_' + result.status);
        setRatesNote(
          'No se pudo leer la fuente oficial (' + backendError + '). Se cargó lista base para continuar.',
          true
        );
        return;
      }

      if (!hasBackendItems) {
        setRatesNote(sourceLabel, true);
        return;
      }

      var note = data && data.note ? data.note : sourceLabel;
      setRatesNote(note, false);
    })
    .catch(function () {
      clearFetchTimer();
      calculatorState.ratesLoaded = true;
      calculatorState.ratesSource = 'fallback';
      renderRateOptions(FALLBACK_RATES);
      setRatesNote('Tasas cargadas desde lista local (sin conexión al servidor). Para cálculo oficial, inicie el servidor.', false);
    });
}

function switchCalculatorMode(mode) {
  var nextMode = mode === 'worker' ? 'worker' : 'general';
  calculatorState.mode = nextMode;

  var tabGeneral = document.getElementById('calcTabGeneral');
  var tabWorker = document.getElementById('calcTabWorker');
  var workerExtrasWrap = document.getElementById('calcWorkerExtrasWrap');
  var capitalLabel = document.getElementById('calcCapitalLabel');
  var result = document.getElementById('heroCalcResult');

  if (tabGeneral) {
    tabGeneral.classList.toggle('is-active', nextMode === 'general');
    tabGeneral.setAttribute('aria-selected', nextMode === 'general' ? 'true' : 'false');
  }
  if (tabWorker) {
    tabWorker.classList.toggle('is-active', nextMode === 'worker');
    tabWorker.setAttribute('aria-selected', nextMode === 'worker' ? 'true' : 'false');
  }
  if (workerExtrasWrap) {
    workerExtrasWrap.classList.toggle('is-hidden', nextMode !== 'worker');
  }
  if (capitalLabel) {
    capitalLabel.textContent = nextMode === 'worker' ? 'Monto base trabajador ($)' : 'Capital base ($)';
  }
  if (result) {
    result.classList.remove('error');
    result.textContent = '';
  }
}

function initHeroCalculator() {
  var form = document.getElementById('heroCalculatorForm');
  if (!form) return;

  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;

  var startInput = document.getElementById('calcStartDate');
  var endInput = document.getElementById('calcEndDate');

  if (startInput && !startInput.value) startInput.value = todayStr;
  if (endInput && !endInput.value) endInput.value = todayStr;

  var rateTypeSelect = document.getElementById('calcRateType');
  if (rateTypeSelect) {
    rateTypeSelect.addEventListener('change', applySelectedRateType);
  }

  switchCalculatorMode('general');
  renderRateOptions(FALLBACK_RATES);
  calculatorState.ratesLoaded = true;
  calculatorState.ratesSource = 'fallback';
  loadChacoRates();
}

async function handleCalculatorSubmit(e) {
  e.preventDefault();
  if (calculatorState.isCalculating) return;

  var capital = parseMoneyInput('calcCapital');
  var workerExtras = parseMoneyInput('calcWorkerExtras');
  var annualRate = parseMoneyInput('calcRate');
  var honorPct = parseMoneyInput('calcHonorPct');
  var startDateRaw = document.getElementById('calcStartDate') ? document.getElementById('calcStartDate').value : '';
  var endDateRaw = document.getElementById('calcEndDate') ? document.getElementById('calcEndDate').value : '';
  var rateTypeEl = document.getElementById('calcRateType');
  var selectedRateOption = rateTypeEl ? rateTypeEl.options[rateTypeEl.selectedIndex] : null;
  var selectedRateLabel = selectedRateOption ? selectedRateOption.textContent : 'Personalizada (manual)';
  var selectedRateValue = selectedRateOption ? String(selectedRateOption.value || '') : 'custom';
  var selectedRateFallback = selectedRateOption ? selectedRateOption.getAttribute('data-rate') : '';
  var isOfficialRate = isOfficialRateValue(selectedRateValue);
  var isPactadaOfficial = selectedRateValue === '6';

  if (!isFinite(capital) || capital <= 0) {
    renderCalculatorError('Ingrese un capital válido mayor a cero.');
    return;
  }
  if (!startDateRaw || !endDateRaw) {
    renderCalculatorError('Complete las fechas de cálculo.');
    return;
  }

  var startDate = new Date(startDateRaw + 'T00:00:00');
  var endDate = new Date(endDateRaw + 'T00:00:00');

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    renderCalculatorError('Las fechas ingresadas no son válidas.');
    return;
  }
  if (endDate < startDate) {
    renderCalculatorError('La fecha \"Hasta\" no puede ser menor que \"Desde\".');
    return;
  }

  if (!isFinite(workerExtras) || workerExtras < 0) workerExtras = 0;
  if (!isFinite(honorPct) || honorPct < 0) honorPct = 0;
  if (honorPct > MAX_HONORARIOS_PERCENT) {
    renderCalculatorError('Honorarios (%) debe estar entre 0 y ' + MAX_HONORARIOS_PERCENT + '.');
    return;
  }
  if ((!isOfficialRate || isPactadaOfficial) && (!isFinite(annualRate) || annualRate < 0)) {
    renderCalculatorError('Ingrese una tasa anual válida.');
    return;
  }
  if (isPactadaOfficial && annualRate <= 0) {
    renderCalculatorError('Para tipo PACTADA debe ingresar una tasa anual mayor a cero.');
    return;
  }

  var days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
  var principal = capital + (calculatorState.mode === 'worker' ? workerExtras : 0);
  var modeLabel = calculatorState.mode === 'worker' ? 'Laboral trabajador' : 'General';
  var result = document.getElementById('heroCalcResult');
  if (!result) return;

  var workerRows = '';
  if (calculatorState.mode === 'worker') {
    workerRows = '<div class=\"hero-calc-result-row\"><span>Adicionales</span><strong>' + formatCurrencyAr(workerExtras) + '</strong></div>';
  }

  if (!isOfficialRate) {
    var interestManual = principal * (annualRate / 100) * (days / 365);
    var updatedManual = principal + interestManual;
    var honorManual = updatedManual * (honorPct / 100);
    var totalManual = updatedManual + honorManual;
    var honorRowManual = '';
    if (honorPct > 0) {
      honorRowManual = '<div class=\"hero-calc-result-row\"><span>Honorarios (' + honorPct.toFixed(2) + '%)</span><strong>' + formatCurrencyAr(honorManual) + '</strong></div>';
    }

    result.classList.remove('error');
    result.innerHTML =
      '<div class=\"hero-calc-result-card\">' +
        '<div class=\"hero-calc-result-row\"><span>Modo</span><strong>' + modeLabel + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Tasa aplicada</span><strong>' + selectedRateLabel + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Días calculados</span><strong>' + days + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Capital base</span><strong>' + formatCurrencyAr(capital) + '</strong></div>' +
        workerRows +
        '<div class=\"hero-calc-result-row\"><span>Capital computado</span><strong>' + formatCurrencyAr(principal) + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Interés estimado</span><strong>' + formatCurrencyAr(interestManual) + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Monto actualizado</span><strong>' + formatCurrencyAr(updatedManual) + '</strong></div>' +
        honorRowManual +
        '<div class=\"hero-calc-result-total\"><span>Total estimado</span><span id=\"calcTotalResult\">' + formatCurrencyAr(0) + '</span></div>' +
      '</div>';
    
    // Iniciar animación (1.5 segundos)
    animateCurrency('calcTotalResult', totalManual, 1500);
    return;
  }

  calculatorState.isCalculating = true;
  setCalculatorSubmitLoading(true);
  result.classList.remove('error');
  result.textContent = 'Consultando calculadora oficial de Chaco...';

  try {
    var payload = {
      importe: principal,
      idTipoTasa: selectedRateValue,
      desde: startDateRaw,
      hasta: endDateRaw
    };
    if (isPactadaOfficial) {
      payload.tasaPactada = annualRate;
    }

    var calcController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var calcTimer = calcController ? setTimeout(function () { calcController.abort(); }, 20000) : null;
    var response;

    try {
      response = await fetch('/api/tasas/chaco/calcular', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: calcController ? calcController.signal : undefined
      });
    } finally {
      if (calcTimer !== null) clearTimeout(calcTimer);
    }

    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data || data.ok !== true) {
      var backendError = (data && data.error) || ('HTTP_' + response.status);
      if (response.status === 404) {
        throw new Error('El servicio de cálculo no está disponible en este momento (HTTP_404).');
      }
      throw new Error('No se pudo calcular con la fuente oficial (' + backendError + ').');
    }

    var parsed = data.parsed || {};
    var interestOfficial = Number(parsed.interest);
    var updatedOfficial = Number(parsed.total);
    var daysOfficial = Number(parsed.days);
    var officialRatePct = Number(parsed.ratePct);

    if (!isFinite(updatedOfficial)) {
      throw new Error('La fuente oficial no devolvió un monto total válido.');
    }
    if (!isFinite(interestOfficial)) {
      interestOfficial = updatedOfficial - principal;
    }
    if (!isFinite(daysOfficial)) {
      daysOfficial = days;
    }

    var honorOfficial = updatedOfficial * (honorPct / 100);
    var totalOfficial = updatedOfficial + honorOfficial;
    var honorRowOfficial = '';
    var tasaMostrar = isFinite(officialRatePct)
      ? (officialRatePct.toFixed(4).replace('.', ',') + '%')
      : selectedRateLabel;

    if (honorPct > 0) {
      honorRowOfficial = '<div class=\"hero-calc-result-row\"><span>Honorarios (' + honorPct.toFixed(2) + '%)</span><strong>' + formatCurrencyAr(honorOfficial) + '</strong></div>';
    }

    result.classList.remove('error');
    result.innerHTML =
      '<div class=\"hero-calc-result-card\">' +
        '<div class=\"hero-calc-result-row\"><span>Modo</span><strong>' + modeLabel + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Tasa oficial</span><strong>' + tasaMostrar + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Días calculados</span><strong>' + daysOfficial + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Capital base</span><strong>' + formatCurrencyAr(capital) + '</strong></div>' +
        workerRows +
        '<div class=\"hero-calc-result-row\"><span>Capital computado</span><strong>' + formatCurrencyAr(principal) + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Interés oficial</span><strong>' + formatCurrencyAr(interestOfficial) + '</strong></div>' +
        '<div class=\"hero-calc-result-row\"><span>Monto actualizado oficial</span><strong>' + formatCurrencyAr(updatedOfficial) + '</strong></div>' +
        honorRowOfficial +
        '<div class=\"hero-calc-result-total\"><span>Total estimado</span><span id=\"calcTotalResult\">' + formatCurrencyAr(0) + '</span></div>' +
      '</div>';

    setRatesNote('Motor oficial de tasas de Chaco aplicado.', false);
    
    // Iniciar animación (2 segundos para dar más dramatismo al cálculo oficial)
    animateCurrency('calcTotalResult', totalOfficial, 2000);
  } catch (error) {
    var fallbackAnnualRate = isPactadaOfficial ? annualRate : Number(selectedRateFallback);
    var canUseManualFallback = selectedRateFallback !== ''
      && isFinite(fallbackAnnualRate)
      && fallbackAnnualRate >= 0;

    if (isPactadaOfficial) {
      canUseManualFallback = isFinite(fallbackAnnualRate) && fallbackAnnualRate > 0;
    }

    if (canUseManualFallback) {
      var interestFallback = principal * (fallbackAnnualRate / 100) * (days / 365);
      var updatedFallback = principal + interestFallback;
      var honorFallback = updatedFallback * (honorPct / 100);
      var totalFallback = updatedFallback + honorFallback;
      var honorRowFallback = '';
      var rateFallbackLabel = isPactadaOfficial
        ? (fallbackAnnualRate.toFixed(4).replace('.', ',') + '% (PACTADA manual)')
        : (selectedRateLabel + ' (estimación manual)');

      if (honorPct > 0) {
        honorRowFallback = '<div class=\"hero-calc-result-row\"><span>Honorarios (' + honorPct.toFixed(2) + '%)</span><strong>' + formatCurrencyAr(honorFallback) + '</strong></div>';
      }

      result.classList.remove('error');
      result.innerHTML =
        '<div class=\"hero-calc-result-card\">' +
          '<div class=\"hero-calc-result-row\"><span>Modo</span><strong>' + modeLabel + '</strong></div>' +
          '<div class=\"hero-calc-result-row\"><span>Tasa aplicada</span><strong>' + rateFallbackLabel + '</strong></div>' +
          '<div class=\"hero-calc-result-row\"><span>Días calculados</span><strong>' + days + '</strong></div>' +
          '<div class=\"hero-calc-result-row\"><span>Capital base</span><strong>' + formatCurrencyAr(capital) + '</strong></div>' +
          workerRows +
          '<div class=\"hero-calc-result-row\"><span>Capital computado</span><strong>' + formatCurrencyAr(principal) + '</strong></div>' +
          '<div class=\"hero-calc-result-row\"><span>Interés estimado</span><strong>' + formatCurrencyAr(interestFallback) + '</strong></div>' +
          '<div class=\"hero-calc-result-row\"><span>Monto actualizado estimado</span><strong>' + formatCurrencyAr(updatedFallback) + '</strong></div>' +
          honorRowFallback +
          '<div class=\"hero-calc-result-total\"><span>Total estimado</span><span id=\"calcTotalResult\">' + formatCurrencyAr(0) + '</span></div>' +
        '</div>';

      setRatesNote(
        'No respondió la fuente oficial (' + ((error && error.message) ? error.message : 'ERROR') + '). Se aplicó estimación manual para continuar.',
        true
      );
      animateCurrency('calcTotalResult', totalFallback, 1500);
    } else {
      var errorMessage = error && error.name === 'AbortError'
        ? 'La fuente oficial demoró demasiado y se canceló la consulta.'
        : ((error && error.message) ? error.message : 'Error al calcular con la fuente oficial.');
      renderCalculatorError(errorMessage + ' Revise el período elegido o use \"Personalizada (manual)\" como alternativa.');
    }
  } finally {
    calculatorState.isCalculating = false;
    setCalculatorSubmitLoading(false);
  }
}

// ===== BUHO ASESOR (SECCION DIAGNOSTICO) =====
// Maquina de estados de tres capas: 'reposo' (idle.gif), 'lectura' (review.gif,
// el buho hojea el libro) y 'saludo' (wave.gif, levanta el ala).
//
// Por que no basta con :hover:
//   En telefonos no existe el cursor, asi que la animacion de lectura no se
//   veia nunca y el GIF igual consumia CPU. Ahora la lectura entra sola tras
//   unos segundos sin interaccion, y el saludo se dispara al tocar.
//
// Cuidados de rendimiento:
//   - Solo UNA animacion viva a la vez. Las capas inactivas quedan aparcadas en
//     un GIF transparente de 1x1: ocultarlas con opacity/visibility no basta,
//     porque un <img> oculto puede seguir animandose segun el navegador.
//   - El temporizador de inactividad se apaga si el buho sale de pantalla o si
//     la pestana pasa a segundo plano.
//   - Los listeners de actividad son passive y estan limitados por tiempo para
//     no reprogramar el timer en cada pixel de scroll.
var OWL_IDLE_DELAY = 6000;   // ms sin interaccion antes de ponerse a leer
var OWL_GREET_MS = 780;      // debe coincidir con la duracion de la animacion CSS
var OWL_ACTIVITY_THROTTLE = 250;
var OWL_FADE_MS = 220;       // idem: duracion del fundido en styles.css
// GIF transparente de 1x1. Un <img> apuntando aca no tiene nada que animar.
var OWL_BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function initOwlDoctor() {
  var root = document.getElementById('owlDoctor');
  if (!root) return;

  var layers = {
    reposo: root.querySelector('.buho-reposo'),
    lectura: root.querySelector('.buho-lectura'),
    saludo: root.querySelector('.buho-saludo')
  };
  if (!layers.reposo || !layers.lectura || !layers.saludo) return;

  var reduceMotion = prefersReducedMotion();
  var canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  var state = 'reposo';
  var idleTimer = null;
  var greetTimer = null;
  var parkTimer = null;
  var lastActivityAt = 0;
  var isGreeting = false;
  var isHovered = false;
  var inView = true;

  // Mantiene los tres GIF en la cache de memoria del navegador para que
  // reactivar una capa sea instantaneo y no dispare una peticion de red.
  var warmup = [];
  Object.keys(layers).forEach(function (key) {
    var url = layers[key].getAttribute('data-src');
    if (!url) return;
    var pre = new Image();
    pre.src = url;
    warmup.push(pre);
  });

  function liveSrc(img) {
    var url = img.getAttribute('data-src');
    if (url && img.getAttribute('src') !== url) img.src = url;
  }

  // Aparca en el GIF vacio todas las capas que no sean la activa. Se llama al
  // terminar el fundido para no cortar la transicion a mitad de camino.
  function parkInactive() {
    Object.keys(layers).forEach(function (key) {
      if (key === state) return;
      var img = layers[key];
      if (img.getAttribute('src') !== OWL_BLANK) img.src = OWL_BLANK;
    });
  }

  function setState(next) {
    if (state === next || !layers[next]) return;
    liveSrc(layers[next]);               // reanuda el GIF entrante (desde cache)
    if (layers[state]) layers[state].classList.remove('is-active');
    layers[next].classList.add('is-active');
    state = next;
    root.setAttribute('data-owl-state', next);

    clearTimeout(parkTimer);
    parkTimer = setTimeout(parkInactive, OWL_FADE_MS + 60);
  }

  function stopIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function scheduleIdle() {
    stopIdleTimer();
    // Nada de temporizadores si el buho no se ve o esta saludando.
    if (!inView || isGreeting || isHovered || document.hidden) return;
    idleTimer = setTimeout(function () {
      setState('lectura');
    }, OWL_IDLE_DELAY);
  }

  function onActivity() {
    var now = Date.now();
    if (now - lastActivityAt < OWL_ACTIVITY_THROTTLE) return;
    lastActivityAt = now;
    if (isGreeting || isHovered) return;
    if (state === 'lectura') setState('reposo');
    scheduleIdle();
  }

  // Lleva al usuario al modulo de IA y, si el panel activo todavia esta en el
  // paso inicial, arranca el diagnostico. Si ya hay uno en curso solo hace
  // scroll, para no pisar la respuesta a medio responder.
  function openDiagnostic() {
    var area = document.getElementById('diagnosticArea');
    if (area && typeof area.scrollIntoView === 'function') {
      area.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }

    var panel = document.querySelector('.ia-panel:not(.is-hidden)');
    if (!panel) return;
    var activeStep = panel.querySelector('.diagnostic-step.active');
    if (!activeStep) return;
    if (activeStep.id !== 'expressStep0' && activeStep.id !== 'step0') return;
    var startBtn = activeStep.querySelector('button');
    if (startBtn) startBtn.click();
  }

  function greet(done) {
    if (isGreeting) return;
    isGreeting = true;
    stopIdleTimer();
    setState('saludo');

    // Reinicio forzado de la animacion por si se toca dos veces seguidas.
    root.classList.remove('is-greeting');
    void root.offsetWidth;
    root.classList.add('is-greeting');

    clearTimeout(greetTimer);
    greetTimer = setTimeout(function () {
      root.classList.remove('is-greeting');
      isGreeting = false;
      setState(isHovered ? 'lectura' : 'reposo');
      scheduleIdle();
      if (typeof done === 'function') done();
    }, OWL_GREET_MS);
  }

  function activate() {
    if (isGreeting) return;
    // Con movimiento reducido se salta el saludo y se va directo a la accion.
    if (reduceMotion) { openDiagnostic(); return; }
    greet(openDiagnostic);
  }

  // --- Interaccion: click y touchstart ---------------------------------
  // En tactil el `click` sintetico llega despues del `touchstart` ya atendido,
  // asi que se descarta con una ventana de tiempo para no saludar dos veces.
  var lastTouchAt = 0;

  root.addEventListener('touchstart', function () {
    lastTouchAt = Date.now();
    activate();
  }, { passive: true });

  root.addEventListener('click', function () {
    if (Date.now() - lastTouchAt < 900) return;
    activate();
  });

  root.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  });

  // --- Hover solo en equipos con puntero fino --------------------------
  if (canHover) {
    root.addEventListener('pointerenter', function () {
      isHovered = true;
      if (isGreeting) return;
      stopIdleTimer();
      setState('lectura');
    });
    root.addEventListener('pointerleave', function () {
      isHovered = false;
      if (isGreeting) return;
      setState('reposo');
      scheduleIdle();
    });
  }

  // --- Solo animar lo que se ve ----------------------------------------
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) {
        scheduleIdle();
      } else {
        stopIdleTimer();
        if (!isGreeting && state === 'lectura') setState('reposo');
      }
    }, { threshold: 0.1 });
    observer.observe(root);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopIdleTimer();
    else scheduleIdle();
  });

  var activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
  activityEvents.forEach(function (name) {
    window.addEventListener(name, onActivity, { passive: true });
  });

  // Estado inicial: solo reposo animandose. Se espera a que las capas terminen
  // de cargar para no aparcarlas antes de que lleguen a la cache.
  if (document.readyState === 'complete') parkInactive();
  else window.addEventListener('load', parkInactive, { once: true });

  scheduleIdle();
}

// ===== SIDE ROBOT (ASISTENTE FLOTANTE AL HACER SCROLL) =====
function initSideRobot() {
  // 1. Crear el HTML del robot dinámicamente
  var robotContainer = document.createElement('div');
  robotContainer.className = 'side-robot-container';
  robotContainer.id = 'sideRobot';
  
  // Mensajes rotativos con tono profesional
  var messages = [
    "¿Necesita auditar su caso legal hoy?",
    "Nuestra IA puede analizar su situación.",
    "¿Dudas sobre plazos o liquidaciones?",
    "Estamos en línea para asistirle."
  ];
  
  // Buho asesor, recortado dentro del circulo del avatar.
  // En reposo usa idle.gif y solo pasa a wave.gif durante el saludo: antes
  // wave.gif quedaba en bucle permanente, animandose incluso con el asistente
  // fuera de pantalla.
  var SIDE_IDLE_SRC = 'assets/buho/idle.gif';
  var SIDE_WAVE_SRC = 'assets/buho/wave.gif';
  var reduceMotion = prefersReducedMotion();

  // width/height explicitos: el navegador reserva el espacio y no hay salto
  // de layout cuando entra el GIF.
  var robotSvg = '<img src="' + SIDE_IDLE_SRC + '" id="sideRobotBuho" class="side-robot-buho" ' +
    'width="192" height="208" decoding="async" alt="Buho asesor" />';

  robotContainer.innerHTML =
    '<div class="side-robot-avatar" id="sideRobotAvatar" role="button" tabindex="0" aria-label="Ir al diagnóstico con IA">' +
      robotSvg +
      '<div class="side-robot-close" id="sideRobotClose" role="button" tabindex="0" aria-label="Cerrar asistente">✕</div>' +
    '</div>' +
    '<div class="side-robot-bubble" id="sideRobotText" role="button" tabindex="0">Estimado, ¿en qué podemos asesorarle?</div>';

  document.body.appendChild(robotContainer);

  // Precarga de wave.gif para que el saludo no espere a la red en el primer toque.
  var waveWarmup = new Image();
  waveWarmup.src = SIDE_WAVE_SRC;

  // --- Microinteraccion de saludo --------------------------------------
  var sideGreetTimer = null;
  var sideGreeting = false;

  function sideRobotGreet(done) {
    if (reduceMotion) { if (typeof done === 'function') done(); return; }
    if (sideGreeting) return;
    sideGreeting = true;

    var img = document.getElementById('sideRobotBuho');
    var targets = [
      document.getElementById('sideRobotAvatar'),
      document.getElementById('sideRobotText')
    ];

    // Cambiar el src reinicia el GIF desde el primer cuadro: el ala se levanta
    // justo cuando el usuario toca, no en un punto cualquiera del bucle.
    if (img) img.src = SIDE_WAVE_SRC;
    targets.forEach(function (el) {
      if (!el) return;
      el.classList.remove('is-greeting');
      void el.offsetWidth;
      el.classList.add('is-greeting');
    });

    clearTimeout(sideGreetTimer);
    sideGreetTimer = setTimeout(function () {
      targets.forEach(function (el) { if (el) el.classList.remove('is-greeting'); });
      if (img) img.src = SIDE_IDLE_SRC;
      sideGreeting = false;
      if (typeof done === 'function') done();
    }, OWL_GREET_MS);
  }

  function goToDiagnostic() {
    var target = document.querySelector('.diagnostic');
    if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // --- Interaccion: click y touchstart, con la misma proteccion contra el
  //     click sintetico que dispara el navegador tras un toque.
  var lastSideTouchAt = 0;

  function activateSideRobot() {
    // Si el usuario interactuó, se cancela el auto-ocultado para que el saludo
    // no quede cortado a mitad de camino.
    clearTimeout(scrollHideTimer);
    sideRobotGreet(goToDiagnostic);
  }

  ['sideRobotAvatar', 'sideRobotText'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('touchstart', function () {
      lastSideTouchAt = Date.now();
      activateSideRobot();
    }, { passive: true });

    el.addEventListener('click', function () {
      if (Date.now() - lastSideTouchAt < 900) return;
      activateSideRobot();
    });

    el.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        activateSideRobot();
      }
    });
  });

  var closeBtn = document.getElementById('sideRobotClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      window.hideSideRobot();
    });
    closeBtn.addEventListener('touchstart', function (event) {
      event.stopPropagation();
    }, { passive: true });
    closeBtn.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        event.stopPropagation();
        window.hideSideRobot();
      }
    });
  }

  // 2. Lógica de aparición basada en scroll
  var sideRobotVisible = false;
  var sideRobotCooldown = false;
  var scrollHideTimer = null;
  var robotCooldownTimer = null;
  var greetOnEnterTimer = null;
  var sideParkTimer = null;
  var diagnosticInView = false;
  var lastMsgIndex = -1;

  // Al ocultarse se cancela cualquier saludo pendiente y, una vez terminada la
  // salida, se aparca el GIF. El asistente vive siempre en el DOM: sin esto se
  // quedaba animando fuera de pantalla todo el tiempo, gastando bateria para
  // nadie. Ocultarlo por CSS no basta, hay que soltar el GIF.
  function resetSideRobotAnimation() {
    clearTimeout(greetOnEnterTimer);
    clearTimeout(sideGreetTimer);
    clearTimeout(sideParkTimer);
    sideGreeting = false;
    ['sideRobotAvatar', 'sideRobotText'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('is-greeting');
    });
    sideParkTimer = setTimeout(function () {
      var img = document.getElementById('sideRobotBuho');
      if (img && !sideRobotVisible) img.src = OWL_BLANK;
    }, 750); // dura lo mismo que la transicion de salida
  }

  // Vuelve a poner el GIF de reposo antes de que el asistente entre en pantalla.
  function wakeSideRobotAnimation() {
    clearTimeout(sideParkTimer);
    var img = document.getElementById('sideRobotBuho');
    if (img && img.getAttribute('src') !== SIDE_IDLE_SRC) img.src = SIDE_IDLE_SRC;
  }

  // El asistente nace oculto: apenas el GIF queda en cache se lo aparca, y se
  // reactiva recien al primer scroll que lo muestre.
  var sideImgEl = document.getElementById('sideRobotBuho');
  if (sideImgEl) {
    var parkInitial = function () { if (!sideRobotVisible) sideImgEl.src = OWL_BLANK; };
    if (sideImgEl.complete) parkInitial();
    else sideImgEl.addEventListener('load', parkInitial, { once: true });
  }

  function getRandomMsg() {
    var idx;
    do { idx = Math.floor(Math.random() * messages.length); } while (idx === lastMsgIndex && messages.length > 1);
    lastMsgIndex = idx;
    return messages[idx];
  }

  function showSideRobot() {
    if (sideRobotVisible || sideRobotCooldown || diagnosticInView) return;
    var el = document.getElementById('sideRobot');
    var textEl = document.getElementById('sideRobotText');
    if (!el) return;
    
    if (textEl) textEl.textContent = getRandomMsg();
    wakeSideRobotAnimation();
    el.classList.add('visible');
    sideRobotVisible = true;

    // Saluda una vez al terminar de entrar. Reemplaza al bucle permanente de
    // wave.gif: mismo gesto, pero sin animar nada el resto del tiempo.
    clearTimeout(greetOnEnterTimer);
    greetOnEnterTimer = setTimeout(function () {
      if (sideRobotVisible) sideRobotGreet();
    }, 750);

    // Se esconde automáticamente después de 10 segundos
    clearTimeout(scrollHideTimer);
    scrollHideTimer = setTimeout(function() {
      hideSideRobotAuto();
    }, 10000);
  }

  function hideSideRobotAuto() {
    var el = document.getElementById('sideRobot');
    if (el) el.classList.remove('visible');
    sideRobotVisible = false;
    resetSideRobotAnimation();
    sideRobotCooldown = true;
    clearTimeout(robotCooldownTimer);
    robotCooldownTimer = setTimeout(function() { sideRobotCooldown = false; }, 10000);
  }

  // En pantallas angostas el asistente flotante queda justo encima del buho
  // grande (a 393px de ancho se superponen) y le robaba el toque, con lo que la
  // microinteraccion de saludo del buho no llegaba a dispararse nunca.
  // Mientras el modulo de diagnostico esta a la vista el asistente sobra: su
  // unica funcion es llevar hasta ahi. Se retira y deja de animarse.
  var diagnosticSection = document.getElementById('diagnostico');
  if (diagnosticSection && 'IntersectionObserver' in window) {
    var diagObserver = new IntersectionObserver(function (entries) {
      diagnosticInView = entries[0].isIntersecting;
      if (diagnosticInView && sideRobotVisible) hideSideRobotAuto();
    }, { threshold: 0 });
    diagObserver.observe(diagnosticSection);
  }

  // Mostrar al hacer scroll pasado cierto punto (300px)
  var scrollThreshold = 10;
  var scrollDebounce = null;

  window.addEventListener('scroll', function() {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(function() {
      if (window.scrollY > scrollThreshold) {
        showSideRobot();
      } else {
        // Si vuelve arriba, ocultarlo suavemente
        hideSideRobotAuto();
      }
    }, 200);
  }, { passive: true });

  // Función global para ocultarlo manualmente (con la X) — tiene acceso al closure
  window.hideSideRobot = function() {
    var el = document.getElementById('sideRobot');
    if (el) el.classList.remove('visible');
    sideRobotVisible = false;
    resetSideRobotAnimation();
    sideRobotCooldown = true;
    clearTimeout(robotCooldownTimer);
    robotCooldownTimer = setTimeout(function() { sideRobotCooldown = false; }, 30000);
  };
}

// ===== DIAGNOSTIC MODULE =====
var diagnosticState = {
  step: 0,
  answers: [],
  processingTimer: null
};

var questions = [
  {
    question: '¿Qué frente legal desea auditar en profundidad?',
    options: [
      { label: 'Inmobiliario', icon: '\uD83C\uDFE0' },
      { label: 'Rural', icon: '\uD83C\uDF3E' },
      { label: 'Sucesiones', icon: '\uD83D\uDCDC' },
      { label: 'Accidente de tránsito', icon: '\uD83D\uDE97' }
    ]
  },
  {
    question: '¿Cuál es el nivel de conflictividad actual?',
    options: [
      { label: 'Con conflicto activo', icon: '\u26A0\uFE0F' },
      { label: 'Sin conflicto activo', icon: '\u2705' }
    ]
  },
  {
    question: '¿En qué etapa de gestión se encuentra?',
    options: [
      { label: 'Etapa inicial', icon: '\uD83D\uDE80' },
      { label: 'Caso en curso', icon: '\u23F8\uFE0F' }
    ]
  }
];

var EXPRESS_FLOW = {
  area: {
    question: 'El robot pregunta: ¿Qué área legal requiere auditoría?',
    options: [
      { value: 'laboral', label: 'Laboral' },
      { value: 'sucesiones', label: 'Sucesiones' },
      { value: 'inmobiliario', label: 'Inmobiliario' },
      { value: 'ejecuciones', label: 'Ejecuciones' },
      { value: 'transito', label: 'Accidente de tránsito' }
    ]
  },
  laboral_role: {
    question: '¿Qué rol tenés en el caso laboral?',
    options: [
      { value: 'trabajador', label: 'Trabajador' },
      { value: 'empleador', label: 'Empleador (Demandado)' }
    ]
  },
  laboral_worker_conflict: {
    question: '¿Cuál es el conflicto principal?',
    options: [
      { value: 'despido_sin_causa', label: 'Despido sin causa' },
      { value: 'no_registrado', label: 'Trabajo no registrado (en negro)' },
      { value: 'diferencias_salariales', label: 'Diferencias salariales' },
      { value: 'accidente_art', label: 'Accidente / ART' }
    ]
  },
  laboral_employer_conflict: {
    question: '¿Qué necesitás resolver como demandado?',
    options: [
      { value: 'defensa_demanda', label: 'Defensa ante demanda laboral' },
      { value: 'impugnacion_liquidacion', label: 'Impugnación de liquidación' },
      { value: 'estrategia_probatoria', label: 'Estrategia probatoria' },
      { value: 'acuerdo_conciliacion', label: 'Acuerdo / conciliación' }
    ]
  },
  sucesiones_status: {
    question: '¿Cuál es el estado del acervo hereditario?',
    options: [
      { value: 'acuerdo_herederos', label: 'Con acuerdo entre herederos' },
      { value: 'conflicto_familiar', label: 'Con conflicto familiar' },
      { value: 'inventario_abierto', label: 'Bienes sin inventario cerrado' }
    ]
  },
  inmobiliario_need: {
    question: '¿Qué gestión necesita?',
    options: [
      { value: 'desalojo', label: 'Desalojo' },
      { value: 'blindaje_contrato', label: 'Blindaje de Contrato' },
      { value: 'tasacion', label: 'Tasación' },
      { value: 'cobro_alquileres', label: 'Cobro de alquileres' }
    ]
  },
  transito_need: {
    question: '¿Qué tipo de reclamo de tránsito necesita resolver?',
    options: [
      { value: 'lesiones', label: 'Lesiones personales' },
      { value: 'danos_materiales', label: 'Daños materiales' },
      { value: 'lesion_grave_fallecimiento', label: 'Lesión grave o fallecimiento' },
      { value: 'defensa_demandado_transito', label: 'Defensa del demandado' }
    ]
  },
  ejecuciones_type: {
    question: '¿Qué tipo de ejecución?',
    options: [
      { value: 'pagare_cheque', label: 'Pagaré / cheque' },
      { value: 'alquileres', label: 'Alquileres' },
      { value: 'sentencia', label: 'Sentencia' },
      { value: 'honorarios', label: 'Honorarios' }
    ]
  },
  ejecuciones_need: {
    question: '¿Qué necesitás ahora?',
    options: [
      { value: 'iniciar_ejecucion', label: 'Iniciar ejecución' },
      { value: 'defensa_excepciones', label: 'Defensa y excepciones' },
      { value: 'embargo', label: 'Embargo' },
      { value: 'levantamiento_embargo', label: 'Levantamiento de embargo' }
    ]
  },
  urgency: {
    question: '¿Hay medida urgente?',
    options: [
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' }
    ]
  },
  docs: {
    question: '¿Cómo está la documentación?',
    options: [
      { value: 'completa', label: 'Completa' },
      { value: 'parcial', label: 'Parcial' },
      { value: 'sin_documentacion', label: 'No la tengo' }
    ]
  }
};

var expressState = {
  step: 0,
  currentQuestionId: 'area',
  areaKey: null,
  areaLabel: '',
  roleKey: '',
  roleLabel: '',
  primaryLabel: '',
  executionTypeLabel: '',
  executionNeedLabel: '',
  urgencyLabel: '',
  docsLabel: '',
  history: [],
  processingTimer: null
};

var TYPING_DELAY = 700;

function pulseRobot() {
  var el = document.querySelector('.diagnostic-robot');
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(function() { el.classList.remove('pulse'); }, 450);
}

function buildTypingBubble() {
  return '<div class="typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
}

function buildProgressBar(step, total) {
  var pct = Math.round((step / total) * 100);
  return '<div class="diag-progress-wrap"><div class="diag-progress-fill" style="width:' + pct + '%"></div></div>' +
         '<span class="diag-progress-label">Paso ' + step + ' de ' + total + '</span>';
}

function initDiagnosticTabs() {
  switchDiagnosticTab('express');
}

function switchDiagnosticTab(tabKey) {
  var tabExpress = document.getElementById('iaTabExpress');
  var tabComplete = document.getElementById('iaTabComplete');
  var panelExpress = document.getElementById('iaPanelExpress');
  var panelComplete = document.getElementById('iaPanelComplete');

  if (!tabExpress || !tabComplete || !panelExpress || !panelComplete) {
    return;
  }

  var activeTabKey = panelExpress.classList.contains('is-hidden') ? 'complete' : 'express';
  if (tabKey === activeTabKey) {
    if (tabKey === 'express') {
      resetExpressDiagnostic();
    } else {
      resetDiagnostic();
    }
    return;
  }

  var isExpress = tabKey !== 'complete';

  tabExpress.classList.toggle('is-active', isExpress);
  tabComplete.classList.toggle('is-active', !isExpress);
  tabExpress.setAttribute('aria-selected', isExpress ? 'true' : 'false');
  tabComplete.setAttribute('aria-selected', isExpress ? 'false' : 'true');

  panelExpress.classList.toggle('is-hidden', !isExpress);
  panelComplete.classList.toggle('is-hidden', isExpress);
  panelExpress.setAttribute('aria-hidden', isExpress ? 'false' : 'true');
  panelComplete.setAttribute('aria-hidden', isExpress ? 'true' : 'false');
}

function showStep(stepNum) {
  for (var i = 0; i <= 5; i++) {
    var el = document.getElementById('step' + i);
    if (el) {
      el.classList.remove('active');
    }
  }

  var target = document.getElementById('step' + stepNum);
  if (target) {
    target.classList.add('active');
  }
}

function startDiagnostic() {
  diagnosticState.step = 1;
  diagnosticState.answers = [];
  renderQuestion(1);
  showStep(1);
}

function renderQuestion(stepNum) {
  var container = document.getElementById('step' + stepNum);
  if (!container) return;

  container.innerHTML = buildTypingBubble();

  setTimeout(function() {
    var q = questions[stepNum - 1];
    var colsClass = q.options.length === 3 ? 'cols-3' : 'cols-2';

    var tagsHTML = '';
    if (diagnosticState.answers.length > 0) {
      tagsHTML = '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin-bottom:1.5rem;">';
      diagnosticState.answers.forEach(function (a) {
        tagsHTML += '<span class="answer-tag"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>' + a + '</span>';
      });
      tagsHTML += '</div>';
    }

    var optionsHTML = '<div class="options-grid ' + colsClass + '">';
    q.options.forEach(function (opt) {
      optionsHTML += '<button class="option-btn" onclick="handleAnswer(\'' + opt.label + '\')">';
      optionsHTML += '<span class="emoji">' + opt.icon + '</span>';
      optionsHTML += '<span class="label">' + opt.label + '</span>';
      optionsHTML += '</button>';
    });
    optionsHTML += '</div>';

    container.innerHTML =
      buildProgressBar(stepNum, 3) +
      tagsHTML +
      '<div class="question-card">' +
        '<h3>' + q.question + '</h3>' +
        optionsHTML +
      '</div>';

    pulseRobot();
  }, TYPING_DELAY);
}

function handleAnswer(answer) {
  diagnosticState.answers.push(answer);
  var currentStep = diagnosticState.step;

  if (currentStep < 3) {
    diagnosticState.step = currentStep + 1;
    renderQuestion(diagnosticState.step);
    showStep(diagnosticState.step);
  } else {
    diagnosticState.step = 4;
    renderProcessing();
    showStep(4);
    if (diagnosticState.processingTimer) {
      clearTimeout(diagnosticState.processingTimer);
    }
    diagnosticState.processingTimer = setTimeout(function () {
      diagnosticState.step = 5;
      renderResult();
      showStep(5);
    }, 3200);
  }
}

function renderProcessing() {
  var container = document.getElementById('step4');

  var tagsHTML = '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin-bottom:1rem;">';
  diagnosticState.answers.forEach(function (a) {
    tagsHTML += '<span class="answer-tag"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>' + a + '</span>';
  });
  tagsHTML += '</div>';

  var progressBars = [
    { label: 'Análisis de precedentes', delay: '' },
    { label: 'Verificación de plazos', delay: 'delay-1' },
    { label: 'Modelado de escenarios', delay: 'delay-2' }
  ];

  var barsHTML = '<div style="max-width:400px;margin:0 auto;display:flex;flex-direction:column;gap:0.5rem;">';
  progressBars.forEach(function (bar) {
    barsHTML += '<div class="progress-bar-wrapper">';
    barsHTML += '<span class="progress-bar-label">' + bar.label + '</span>';
    barsHTML += '<div class="progress-bar-track"><div class="progress-bar-fill ' + bar.delay + '"></div></div>';
    barsHTML += '</div>';
  });
  barsHTML += '</div>';

  container.innerHTML =
    '<div class="processing-wrapper">' +
      tagsHTML +
      '<div class="scanner">' +
        '<div class="scanner-ring-1"></div>' +
        '<div class="scanner-ring-2"></div>' +
        '<div class="scanner-ring-3"></div>' +
        '<div class="scanner-dot"></div>' +
      '</div>' +
      '<div style="margin-bottom:1.5rem;">' +
        '<p class="text-gold font-bold text-base font-mono" style="margin-bottom:0.25rem;">Procesando variables del caso y calibrando estrategia legal...</p>' +
        '<p class="text-light-gray text-sm">Auditando precedentes, plazos y jurisprudencia aplicable.</p>' +
      '</div>' +
      barsHTML +
    '</div>';
}

function renderResult() {
  var container = document.getElementById('step5');

  var tagsHTML = '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin-bottom:1.5rem;">';
  diagnosticState.answers.forEach(function (a) {
    tagsHTML += '<span class="answer-tag">' + a + '</span>';
  });
  tagsHTML += '</div>';

  container.innerHTML =
    '<div class="result-card">' +
      tagsHTML +
      '<div class="result-icon">' +
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#d4af37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />' +
          '<polyline points="22 4 12 14.01 9 11.01" />' +
        '</svg>' +
      '</div>' +
      '<h3 class="font-serif text-white" style="font-size:1.5rem;font-weight:700;margin-bottom:0.75rem;">Auditoría completa finalizada.</h3>' +
      '<p class="text-muted text-base" style="line-height:1.65;margin-bottom:0.5rem;">Detectamos <strong style="color:#d4af37;">rutas de acción viables</strong> con potencial estratégico para su situación legal.</p>' +
      '<p class="text-light-gray text-sm" style="margin-bottom:1.5rem;">Comparta su caso por WhatsApp para recibir la recomendación priorizada y próximos pasos.</p>' +
      '<div class="result-buttons">' +
        '<a href="' + WA_LINK + '" target="_blank" rel="noopener noreferrer" class="btn-gold-solid">Solicitar análisis por WhatsApp</a>' +
        '<button class="btn-reset" onclick="resetDiagnostic()">Reiniciar diagnóstico completo</button>' +
      '</div>' +
    '</div>';
}

function resetDiagnostic() {
  diagnosticState.step = 0;
  diagnosticState.answers = [];
  if (diagnosticState.processingTimer) {
    clearTimeout(diagnosticState.processingTimer);
    diagnosticState.processingTimer = null;
  }
  for (var i = 1; i <= 5; i++) {
    var el = document.getElementById('step' + i);
    if (el) {
      el.innerHTML = '';
    }
  }
  showStep(0);
}

function showExpressStep(stepNum) {
  for (var i = 0; i <= 4; i++) {
    var el = document.getElementById('expressStep' + i);
    if (el) {
      el.classList.remove('active');
    }
  }

  var target = document.getElementById('expressStep' + stepNum);
  if (target) {
    target.classList.add('active');
  }
}

function resetExpressDiagnostic() {
  expressState.step = 0;
  expressState.currentQuestionId = 'area';
  expressState.areaKey = null;
  expressState.areaLabel = '';
  expressState.roleKey = '';
  expressState.roleLabel = '';
  expressState.primaryLabel = '';
  expressState.executionTypeLabel = '';
  expressState.executionNeedLabel = '';
  expressState.urgencyLabel = '';
  expressState.docsLabel = '';
  expressState.history = [];

  if (expressState.processingTimer) {
    clearTimeout(expressState.processingTimer);
    expressState.processingTimer = null;
  }

  for (var i = 1; i <= 4; i++) {
    var el = document.getElementById('expressStep' + i);
    if (el) {
      el.innerHTML = '';
    }
  }

  showExpressStep(0);
}

function startExpressDiagnostic() {
  expressState.currentQuestionId = 'area';
  expressState.history = [];
  expressState.step = 1;
  renderExpressQuestion('area');
}

function getExpressTotalSteps() {
  if (!expressState.areaKey) {
    return 5;
  }
  if (expressState.areaKey === 'laboral' || expressState.areaKey === 'ejecuciones') {
    return 5;
  }
  return 4;
}

function getExpressGridClass(count) {
  if (count === 2 || count >= 4) {
    return 'cols-2';
  }
  return 'cols-3';
}

function getExpressContextParts() {
  var parts = [];
  if (expressState.areaLabel) {
    parts.push(expressState.areaLabel);
  }
  if (expressState.roleLabel) {
    parts.push(expressState.roleLabel);
  }
  if (expressState.areaKey === 'ejecuciones' && expressState.executionTypeLabel) {
    parts.push(expressState.executionTypeLabel);
  }
  return parts;
}

function renderExpressQuestion(questionId) {
  var questionConfig = EXPRESS_FLOW[questionId];
  if (!questionConfig) return;

  expressState.currentQuestionId = questionId;
  expressState.step = expressState.history.length + 1;

  var stepNum = questionId === 'area' ? 1 : 2;
  var container = document.getElementById('expressStep' + stepNum);
  if (!container) return;

  container.innerHTML = buildTypingBubble();
  showExpressStep(stepNum);

  setTimeout(function() {
    var colsClass = getExpressGridClass(questionConfig.options.length);
    var optionsHTML = '<div class="iax-options-grid ' + colsClass + '">';
    questionConfig.options.forEach(function (opt) {
      optionsHTML += '<button class="iax-option-btn" type="button" data-value="' + opt.value + '" onclick="handleExpressOptionSelect(this.getAttribute(\'data-value\'))">' + opt.label + '</button>';
    });
    optionsHTML += '</div>';

    var contextParts = getExpressContextParts();
    var contextHTML = contextParts.length > 0
      ? '<p class="iax-answer-pill">' + contextParts.join(' · ') + '</p>'
      : '';

    var total = getExpressTotalSteps();
    container.innerHTML =
      '<div class="question-card iax-card">' +
        contextHTML +
        buildProgressBar(expressState.step, total) +
        '<h3>' + questionConfig.question + '</h3>' +
        optionsHTML +
      '</div>';

    pulseRobot();
  }, TYPING_DELAY);
}

function getOptionLabel(questionId, optionValue) {
  var questionConfig = EXPRESS_FLOW[questionId];
  if (!questionConfig) {
    return optionValue;
  }

  for (var i = 0; i < questionConfig.options.length; i++) {
    if (questionConfig.options[i].value === optionValue) {
      return questionConfig.options[i].label;
    }
  }

  return optionValue;
}

function getNextExpressQuestionId(questionId, optionValue) {
  if (questionId === 'area') {
    if (optionValue === 'laboral') {
      return 'laboral_role';
    }
    if (optionValue === 'sucesiones') {
      return 'sucesiones_status';
    }
    if (optionValue === 'inmobiliario') {
      return 'inmobiliario_need';
    }
    if (optionValue === 'ejecuciones') {
      return 'ejecuciones_type';
    }
    if (optionValue === 'transito') {
      return 'transito_need';
    }
  }

  if (questionId === 'laboral_role') {
    return optionValue === 'empleador' ? 'laboral_employer_conflict' : 'laboral_worker_conflict';
  }

  if (questionId === 'ejecuciones_type') {
    return 'ejecuciones_need';
  }

  if (
    questionId === 'laboral_worker_conflict' ||
    questionId === 'laboral_employer_conflict' ||
    questionId === 'sucesiones_status' ||
    questionId === 'inmobiliario_need' ||
    questionId === 'transito_need' ||
    questionId === 'ejecuciones_need'
  ) {
    return 'urgency';
  }

  if (questionId === 'urgency') {
    return 'docs';
  }

  if (questionId === 'docs') {
    return null;
  }

  return null;
}

function handleExpressOptionSelect(optionValue) {
  var qid = expressState.currentQuestionId;
  var selectedLabel = getOptionLabel(qid, optionValue);

  expressState.history.push(qid);

  if (qid === 'area') {
    expressState.areaKey = optionValue;
    expressState.areaLabel = selectedLabel;
    expressState.roleKey = '';
    expressState.roleLabel = '';
    expressState.primaryLabel = '';
    expressState.executionTypeLabel = '';
    expressState.executionNeedLabel = '';
    expressState.urgencyLabel = '';
    expressState.docsLabel = '';
  } else if (qid === 'laboral_role') {
    expressState.roleKey = optionValue;
    expressState.roleLabel = selectedLabel;
  } else if (qid === 'laboral_worker_conflict' || qid === 'laboral_employer_conflict' || qid === 'sucesiones_status' || qid === 'inmobiliario_need' || qid === 'transito_need') {
    expressState.primaryLabel = selectedLabel;
  } else if (qid === 'ejecuciones_type') {
    expressState.executionTypeLabel = selectedLabel;
  } else if (qid === 'ejecuciones_need') {
    expressState.executionNeedLabel = selectedLabel;
    expressState.primaryLabel = (expressState.executionTypeLabel ? (expressState.executionTypeLabel + ' - ') : '') + selectedLabel;
  } else if (qid === 'urgency') {
    expressState.urgencyLabel = selectedLabel;
  } else if (qid === 'docs') {
    expressState.docsLabel = selectedLabel;
  }

  var nextQuestionId = getNextExpressQuestionId(qid, optionValue);
  if (nextQuestionId) {
    renderExpressQuestion(nextQuestionId);
    return;
  }

  expressState.step = expressState.history.length + 1;
  renderExpressProcessing();
  showExpressStep(3);

  if (expressState.processingTimer) {
    clearTimeout(expressState.processingTimer);
  }

  expressState.processingTimer = setTimeout(function () {
    expressState.step = expressState.history.length + 2;
    renderExpressResult();
    showExpressStep(4);
  }, 2500);
}

function renderExpressProcessing() {
  var container = document.getElementById('expressStep3');
  if (!container) {
    return;
  }

  var detail = getExpressPrimaryDetail();
  container.innerHTML =
    '<div class="iax-processing">' +
      '<p class="iax-answer-pill">' + (expressState.areaLabel || '[SIN ÁREA]') + ' · ' + detail + '</p>' +
      '<p class="iax-blink-text">Procesando variables del caso y buscando jurisprudencia en Chaco...</p>' +
      '<div class="iax-progress-track"><div class="iax-progress-fill"></div></div>' +
    '</div>';
}

function getExpressPrimaryDetail() {
  if (expressState.areaKey === 'ejecuciones') {
    if (expressState.executionTypeLabel && expressState.executionNeedLabel) {
      return expressState.executionTypeLabel + ' - ' + expressState.executionNeedLabel;
    }
    return expressState.executionNeedLabel || expressState.executionTypeLabel || '[SIN DETALLE]';
  }

  return expressState.primaryLabel || '[SIN DETALLE]';
}

function buildExpressWhatsAppLink() {
  var area = expressState.areaLabel || '[SIN ÁREA]';
  var detail = getExpressPrimaryDetail();
  var extras = [];

  if (expressState.roleLabel) {
    extras.push('Rol: ' + expressState.roleLabel);
  }
  if (expressState.urgencyLabel) {
    extras.push('Urgencia: ' + expressState.urgencyLabel);
  }
  if (expressState.docsLabel) {
    extras.push('Documentación: ' + expressState.docsLabel);
  }

  var waMessage = 'Hola, usé el diagnóstico IA y necesito ayuda con un caso [' + area + '] - [' + detail + '].';
  if (extras.length > 0) {
    waMessage += ' ' + extras.join(' | ') + '.';
  }

  return 'https://wa.me/543644388960?text=' + encodeURIComponent(waMessage);
}

function getExpressCaseSummary() {
  var area = expressState.areaKey;
  var primary = expressState.primaryLabel || '';
  var role = expressState.roleKey;

  if (area === 'laboral') {
    if (role === 'trabajador') {
      if (primary.indexOf('Despido') !== -1 || primary.indexOf('despido') !== -1)
        return 'Su caso involucra un despido sin causa justificada. Tiene derecho a liquidación final, indemnización por antigüedad, integración del mes de despido y preaviso según su antigüedad.';
      if (primary.indexOf('negro') !== -1 || primary.indexOf('registrado') !== -1)
        return 'Su caso involucra trabajo no registrado (en negro). Corresponden multas por falta de registración, doble indemnización y pago de haberes adeudados desde el inicio de la relación.';
      if (primary.indexOf('salarial') !== -1 || primary.indexOf('Diferencias') !== -1)
        return 'Su caso involucra diferencias salariales no abonadas. Se calcularán las diferencias mes a mes con los intereses legales aplicables en Chaco.';
      if (primary.indexOf('ART') !== -1 || primary.indexOf('Accidente') !== -1)
        return 'Su caso involucra un accidente laboral. Procede reclamar ante la ART y, según las circunstancias, iniciar demanda por daño directo al empleador por incumplimiento del deber de seguridad.';
      return 'Su caso laboral como trabajador requiere análisis de la relación de dependencia, la liquidación final y las indemnizaciones aplicables según el convenio colectivo.';
    } else {
      if (primary.indexOf('demanda') !== -1 || primary.indexOf('Defensa') !== -1)
        return 'Su caso requiere defensa ante una demanda laboral. Es fundamental revisar la causal de despido, la documentación del empleado y la liquidación practicada para construir la defensa.';
      if (primary.indexOf('liquidación') !== -1 || primary.indexOf('Impugnación') !== -1)
        return 'Su caso involucra impugnación de liquidación laboral. Se revisará la correcta aplicación del convenio colectivo y los montos reclamados para identificar errores o excesos.';
      return 'Su caso como empleador demandado requiere revisión documental completa, análisis de la liquidación impugnada y diseño de la estrategia probatoria.';
    }
  }
  if (area === 'sucesiones') {
    if (primary.indexOf('acuerdo') !== -1 || primary.indexOf('Acuerdo') !== -1)
      return 'Su sucesión cuenta con acuerdo entre herederos. Se puede tramitar la declaratoria, el inventario y la partición de forma ágil, evitando costos judiciales innecesarios.';
    if (primary.indexOf('conflicto') !== -1 || primary.indexOf('Conflicto') !== -1)
      return 'Su sucesión presenta conflicto entre herederos. Se requiere estrategia de negociación o vía judicial para la partición del acervo, preservando los derechos de cada parte.';
    return 'Su caso de sucesión requiere declaratoria de herederos, inventario de bienes y gestión de la partición del patrimonio del causante conforme la normativa vigente en Chaco.';
  }
  if (area === 'inmobiliario') {
    if (primary.indexOf('Desalojo') !== -1)
      return 'Su caso requiere iniciar un proceso de desalojo. Se evaluará el contrato, las intimaciones previas efectuadas y la vía procesal más expedita disponible en el fuero chaqueño.';
    if (primary.indexOf('Contrato') !== -1 || primary.indexOf('Blindaje') !== -1)
      return 'Su caso requiere revisión y blindaje del contrato. Se analizarán cláusulas de riesgo, garantías, condiciones resolutorias y mecanismos de actualización para proteger su posición.';
    if (primary.indexOf('Tasación') !== -1)
      return 'Su caso requiere una tasación judicial o extrajudicial. Se emitirá un informe técnico con valor pericial para uso en negociaciones, litigios o declaraciones patrimoniales.';
    if (primary.indexOf('alquiler') !== -1 || primary.indexOf('Cobro') !== -1)
      return 'Su caso involucra alquileres adeudados. Se analizará la deuda acumulada, los intereses aplicables y la vía judicial más rápida para su cobro compulsivo.';
    return 'Su caso inmobiliario requiere análisis contractual y definición de la estrategia procesal más adecuada para su situación específica.';
  }
  if (area === 'transito') {
    if (primary.indexOf('Lesiones') !== -1)
      return 'Su caso involucra lesiones personales por accidente de tránsito. Se analizará la responsabilidad civil, el daño corporal y el cálculo de la indemnización incluyendo lucro cesante y daño moral.';
    if (primary.indexOf('materiales') !== -1)
      return 'Su caso involucra daños materiales por accidente de tránsito. Se evaluará la responsabilidad y el reclamo a la aseguradora o directamente al responsable del siniestro.';
    if (primary.indexOf('grave') !== -1 || primary.indexOf('fallecimiento') !== -1)
      return 'Su caso involucra lesión grave o fallecimiento. Corresponde un reclamo integral de daños y perjuicios con tasación pericial del daño y posible denuncia penal.';
    return 'Su caso de tránsito requiere análisis de responsabilidad civil, el seguro involucrado y la estrategia de reclamo más efectiva para obtener la indemnización correspondiente.';
  }
  if (area === 'ejecuciones') {
    if (primary.indexOf('Pagaré') !== -1 || primary.indexOf('cheque') !== -1 || primary.indexOf('pagaré') !== -1)
      return 'Su caso involucra ejecución de título cambiario. Se iniciará el proceso ejecutivo para el cobro compulsivo con solicitud de embargo preventivo sobre bienes del deudor.';
    if (primary.indexOf('alquiler') !== -1 || primary.indexOf('Alquiler') !== -1)
      return 'Su caso involucra ejecución de alquileres adeudados. Se tramitará el cobro judicial de la deuda y, de corresponder, el desalojo de forma simultánea.';
    return 'Su caso de ejecución requiere análisis del título ejecutivo, identificación de bienes del deudor y selección de la vía procesal más expedita en Chaco.';
  }
  return 'Su caso requiere análisis jurídico personalizado para determinar la mejor estrategia de acción disponible en la jurisdicción de Chaco.';
}

function getExpressDocsNeeded() {
  var area = expressState.areaKey;
  var role = expressState.roleKey;
  var primary = expressState.primaryLabel || '';

  if (area === 'laboral') {
    if (role === 'trabajador') {
      var docs = ['Recibos de sueldo (últimos 12 meses)', 'DNI del trabajador', 'Constancia de CUIL / ANSES'];
      if (primary.indexOf('Despido') !== -1 || primary.indexOf('despido') !== -1)
        docs.push('Telegrama de despido o carta documento recibida');
      else if (primary.indexOf('negro') !== -1 || primary.indexOf('registrado') !== -1)
        docs.push('Prueba de trabajo: mensajes, fotos, testigos');
      else if (primary.indexOf('ART') !== -1 || primary.indexOf('Accidente') !== -1) {
        docs.push('Denuncia ante ART');
        docs.push('Informes médicos y certificados de incapacidad');
      }
      return docs;
    } else {
      return ['Legajo completo del empleado', 'Telegrama o carta documento de despido', 'Liquidación final practicada', 'Registros de asistencia y sanciones previas'];
    }
  }
  if (area === 'sucesiones')
    return ['DNI del causante', 'Partida de defunción', 'Partidas de nacimiento de los herederos', 'Escrituras de los bienes (si existen)', 'CUIL del causante'];
  if (area === 'inmobiliario') {
    if (primary.indexOf('Desalojo') !== -1)
      return ['Contrato de locación', 'Comprobantes de deuda de alquileres', 'Intimaciones fehacientes previas', 'Título de propiedad'];
    if (primary.indexOf('Tasación') !== -1)
      return ['Escritura o título de propiedad', 'Planos del inmueble', 'Constancias catastrales'];
    return ['Contrato de locación o escritura', 'Documentación de la propiedad', 'Comprobantes de pago y deuda acumulada'];
  }
  if (area === 'transito')
    return ['Acta policial del accidente', 'Póliza del seguro del vehículo', 'DNI del conductor', 'Informes médicos (si hay lesiones)', 'Presupuesto de reparación del vehículo'];
  if (area === 'ejecuciones') {
    if (primary.indexOf('Pagaré') !== -1 || primary.indexOf('cheque') !== -1 || primary.indexOf('pagaré') !== -1)
      return ['Pagaré / cheque original', 'Acta de protesto notarial', 'Domicilio del deudor', 'CUIT del deudor (si disponible)'];
    return ['Título ejecutivo original', 'Domicilio del deudor', 'CUIT / CUIL del deudor'];
  }
  return ['DNI del consultante', 'Documentación vinculada al caso'];
}

function getExpressStats() {
  var map = {
    laboral:      { total: 8, viable: 2 },
    sucesiones:   { total: 5, viable: 1 },
    inmobiliario: { total: 7, viable: 2 },
    transito:     { total: 6, viable: 1 },
    ejecuciones:  { total: 4, viable: 1 }
  };
  return map[expressState.areaKey] || { total: 6, viable: 1 };
}

function renderExpressResult() {
  var container = document.getElementById('expressStep4');
  if (!container) return;

  var waLink = buildExpressWhatsAppLink();
  var detail = getExpressPrimaryDetail();
  var secondary = [];
  if (expressState.urgencyLabel) secondary.push('Urgencia: ' + expressState.urgencyLabel);
  if (expressState.docsLabel) secondary.push('Documentación: ' + expressState.docsLabel);

  var summary = getExpressCaseSummary();
  var docs = getExpressDocsNeeded();
  var stats = getExpressStats();
  var rutasText = stats.viable + ' ruta' + (stats.viable > 1 ? 's' : '') + ' viable' + (stats.viable > 1 ? 's' : '');

  var docsHTML = '<ul class="result-docs-list">';
  docs.forEach(function(d) { docsHTML += '<li>' + d + '</li>'; });
  docsHTML += '</ul>';

  container.innerHTML =
    '<div class="result-card">' +
      '<p class="iax-answer-pill">' + (expressState.areaLabel || '') + ' · ' + detail + '</p>' +
      (secondary.length > 0 ? '<p class="text-light-gray text-sm" style="margin-bottom:1rem;">' + secondary.join(' · ') + '</p>' : '') +
      '<h3 class="iax-result-title" style="font-size:clamp(1.1rem,3vw,1.35rem);margin-bottom:0.6rem;">Auditoría completada</h3>' +
      '<p class="result-summary">' + summary + '</p>' +
      '<div class="result-docs-section">' +
        '<p class="result-docs-title">Documentación recomendada para su caso:</p>' +
        docsHTML +
      '</div>' +
      '<div class="result-stats-bar">' +
        '<span class="result-stats-number">' + stats.total + '</span>' +
        '<span class="result-stats-text">casos similares analizados<br><strong>' + rutasText + ' detectada' + (stats.viable > 1 ? 's' : '') + '</strong> para esta situación</span>' +
      '</div>' +
      '<div class="result-buttons">' +
        '<a href="' + waLink + '" target="_blank" rel="noopener noreferrer" class="btn-gold-solid">Continuar por WhatsApp</a>' +
        '<button type="button" class="btn-reset" onclick="resetExpressDiagnostic()">Nuevo diagnóstico</button>' +
      '</div>' +
    '</div>';
}

initDiagnosticTabs();
initHeroCalculator();
initVisitCounter();

// ===== CONTACT FORM (ENVIO DIRECTO A WEB3FORMS) =====
// Servicio de entrega del formulario de contacto. La access key es publica:
// Web3Forms la publica en el HTML del cliente en su propia documentacion.
var CONTACT_ENDPOINT = 'https://api.web3forms.com/submit';
var CONTACT_ACCESS_KEY = 'ceb768b5-b675-4a15-81b7-4da302e2afc8';

// Envia un evento a Google Analytics si esta disponible. Si el visitante
// bloquea la analitica, la web sigue funcionando igual.
function registrarEvento(nombre, datos) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', nombre, datos || {});
    }
  } catch (error) {
    // la medicion nunca debe interrumpir al visitante
  }
}

// Cuenta los clics en los botones de WhatsApp, que son el canal principal
// de contacto del estudio.
document.addEventListener('click', function (e) {
  var enlace = e.target && e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
  if (enlace) {
    registrarEvento('contacto_whatsapp', {
      origen: enlace.classList.contains('whatsapp-float') ? 'boton_flotante' : 'enlace_pagina'
    });
  }
});

// Aviso interno por WhatsApp. Es accesorio: se dispara despues de que la
// consulta ya salio por correo y cualquier fallo se ignora en silencio.
function notifyWhatsapp(nombre, email, consulta) {
  try {
    fetch('/api/aviso-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre, email: email, consulta: consulta }),
      keepalive: true
    }).catch(function () {});
  } catch (error) {
    // sin efecto para el visitante
  }
}

function handleContactSubmit(e) {
  e.preventDefault();

  var form = e.target;
  var btn = document.getElementById('submitBtn');
  var status = document.getElementById('contactStatus');

  if (status) {
    status.textContent = '';
    status.classList.remove('success', 'error');
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }

  var formData = new FormData(form);
  var senderEmail = formData.get('email');
  if (senderEmail) {
    formData.set('_replyto', String(senderEmail).trim());
  }

  var nombre = String(formData.get('nombre') || '').trim();
  var email = String(formData.get('email') || '').trim();
  var consulta = String(formData.get('consulta') || '').trim();
  var honeypot = String(formData.get('website') || formData.get('_honey') || '').trim();

  // El envio va directo desde el navegador a Web3Forms: el plan gratuito solo
  // acepta solicitudes del lado del cliente. La access key es publica por diseno.
  var payload = {
    access_key: CONTACT_ACCESS_KEY,
    subject: 'Nueva consulta de ' + nombre,
    from_name: 'Web Juridico',
    replyto: email,
    botcheck: honeypot ? true : false,
    Nombre: nombre,
    Email: email,
    Consulta: consulta
  };

  var abortController = typeof AbortController === 'function' ? new AbortController() : null;
  var abortTimer = abortController
    ? setTimeout(function () { abortController.abort(); }, 25000)
    : null;

  fetch(CONTACT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: abortController ? abortController.signal : undefined
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) {
          return { ok: res.ok, data: data || {}, status: res.status };
        });
    })
    .then(function (result) {
      var data = result.data || {};
      var isSuccess = result.ok && data.success !== false;

      if (isSuccess) {
        if (btn) {
          btn.textContent = '✓ Consulta enviada';
        }
        if (status) {
          status.textContent = 'Consulta enviada. Le responderemos pronto.';
          status.classList.add('success');
        }
        registrarEvento('generate_lead', { method: 'formulario_contacto' });
        notifyWhatsapp(nombre, email, consulta);
        form.reset();
      } else {
        // La respuesta de error del servicio viene en ingles: se muestra un
        // mensaje propio y se deja el detalle en consola para diagnostico.
        var errorMessage = 'No se pudo enviar la consulta. Escribanos a asesoresjuridicosinmo@gmail.com o por WhatsApp.';
        if (result.status === 429) {
          errorMessage = 'Demasiados intentos. Espere unos minutos.';
        }
        if (data.message) {
          console.error('CONTACT_SEND_ERROR', result.status, data.message);
        }

        if (btn) {
          btn.textContent = 'Error al enviar';
        }
        if (status) {
          status.textContent = errorMessage;
          status.classList.add('error');
        }
      }
    })
    .catch(function (error) {
      var isTimeout = error && error.name === 'AbortError';
      if (btn) {
        btn.textContent = 'Error al enviar';
      }
      if (status) {
        status.textContent = isTimeout
          ? 'El envio demoro demasiado. Escribanos a asesoresjuridicosinmo@gmail.com o por WhatsApp.'
          : 'Error de conexion. Verifique internet e intente nuevamente.';
        status.classList.add('error');
      }
    })
    .finally(function () {
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
      setTimeout(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Enviar Consulta';
        }
      }, 2500);
    });
}
// ===== SMOOTH SCROLL FOR ANCHOR LINKS =====
document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
  anchor.addEventListener('click', function (e) {
    var targetId = this.getAttribute('href');
    if (targetId === '#') return;
    var targetEl = document.querySelector(targetId);
    if (targetEl) {
      e.preventDefault();
      var headerHeight = header.offsetHeight;
      var targetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ─── Tasador Exprés / ValorJusto Modal ──────────────────────────────────────
function initValorJustoModal() {
  var openBtn = document.getElementById('openValorJustoModal');
  var closeBtn = document.getElementById('closeValorJustoModal');
  var modal = document.getElementById('valorJustoModal');

  if (!openBtn || !closeBtn || !modal || modal.dataset.initialized === 'true') {
    return;
  }

  modal.dataset.initialized = 'true';

  var closeTargets = modal.querySelectorAll('[data-close-valorjusto]');
  var lastFocusedElement = null;

  function openModal() {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('vj-modal-open');
    closeBtn.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('vj-modal-open');
    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  closeTargets.forEach(function(node) {
    node.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });
}

initValorJustoModal();
