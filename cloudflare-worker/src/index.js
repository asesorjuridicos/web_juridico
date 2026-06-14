const RATE_CONFIG = {
  '1': ['T. PASIVA USO JUSTICIA BCRA', 'calcular_tasa_pasiva.php'],
  '2': ['T. ACTIVA 30 DIAS BNA', 'calcular_tasa_activa.php'],
  '3': ['24%', 'calcular_tasa_numerica.php'],
  '4': ['32%', 'calcular_tasa_numerica.php'],
  '5': ['36%', 'calcular_tasa_numerica.php'],
  '6': ['PACTADA', 'calcular_tasa_pactada.php'],
  '7': ['T. ACTIVA 30 DIAS BNA X 1,5', 'calcular_tasa_activa_15.php'],
  '9': ['48%', 'calcular_tasa_numerica.php'],
  '10': ['08%', 'calcular_tasa_numerica.php'],
  '11': ['56%', 'calcular_tasa_numerica.php'],
  '13': ['06%', 'calcular_tasa_numerica.php'],
  '14': [
    'T. ALIMENTOS ART.552 CCCN BCRA + T.A. BNA',
    'calcular_tasa_alimentos.php'
  ],
  '15': ['T. INTERESES MORATORIOS (TIM) BCRA', 'calcular_tasa_tim.php']
};

const OFFICIAL_API_BASE =
  'https://www.justiciachaco.gov.ar/views/modules/profesionales/calcula_tasas/';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true });
    }

    if (request.method !== 'POST' || url.pathname !== '/calculate') {
      return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
    }

    let data;
    try {
      data = await request.json();
    } catch (_error) {
      return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
    }

    const rateTypeId = String(data.idTipoTasa || '');
    const config = RATE_CONFIG[rateTypeId];
    const fromDate = String(data.desde || '');
    const toDate = String(data.hasta || '');

    if (!config) {
      return jsonResponse({ ok: false, error: 'TIPO_TASA_INVALIDO' }, 400);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)
      || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
      || toDate < fromDate
    ) {
      return jsonResponse({ ok: false, error: 'FECHA_INVALIDA' }, 400);
    }

    // The proxy only needs the percentage for the selected period.
    // Using a normalized amount avoids transmitting the user's real capital.
    const form = new URLSearchParams({
      importe: '100',
      fecha_desde: fromDate,
      fecha_hasta: toDate,
      id_tipo_tasa: rateTypeId,
      descripcion_tipo: config[0]
    });

    if (rateTypeId === '6') {
      const agreedRate = Number(data.tasaPactada);
      if (!Number.isFinite(agreedRate) || agreedRate <= 0) {
        return jsonResponse({ ok: false, error: 'TASA_PACTADA_INVALIDA' }, 400);
      }
      form.set('tasa_pactada', String(agreedRate));
    }

    try {
      const response = await fetch(`${OFFICIAL_API_BASE}${config[1]}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: form.toString()
      });
      const responseText = await response.text();

      return new Response(responseText, {
        status: response.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error && error.message ? error.message : 'UPSTREAM_FAILED'
        },
        502
      );
    }
  }
};
