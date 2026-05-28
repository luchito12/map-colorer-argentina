// Map Colorer Argentina — Popup JS
// Sincroniza con el content script activo sin resetear el estado

(function () {
  'use strict';

  let state = {
    layers:    { provincias: true, municipios: false, barrios: false, regiones: false },
    colors:    { provincias: '#3399FF', municipios: '#FF6633', barrios: '#66AA00', regiones: '#CC8800' },
    opacities: { provincias: 40, municipios: 40, barrios: 45, regiones: 30 },
    fourColors: false
  };

  const LAYERS = ['provincias', 'municipios', 'barrios', 'regiones'];

  // ── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    renderUI();
    bindEvents();
    checkTabStatus();
  });

  // ── Estado desde storage ────────────────────────────────────────────────────
  function loadState() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
        if (data) {
          if (data.layers)    state.layers    = { ...state.layers,    ...data.layers };
          if (data.colors)    state.colors    = { ...state.colors,    ...data.colors };
          if (data.opacities) state.opacities = { ...state.opacities, ...data.opacities };
          if (data.fourColors !== undefined) state.fourColors = data.fourColors;
        }
        resolve();
      });
    });
  }

  function saveAndPush() {
    // 1. Guardar en storage
    chrome.runtime.sendMessage({ type: 'SET_STATE', payload: state });
    // 2. Enviar al content script de la tab activa
    chrome.runtime.sendMessage({
      type: 'PUSH_TO_CONTENT',
      payload: state
    });
  }

  // ── Render UI desde estado ──────────────────────────────────────────────────
  function renderUI() {
    LAYERS.forEach(layer => {
      const tog    = document.getElementById(`tog-${layer}`);
      const swatch = document.getElementById(`swatch-${layer}`);
      const slider = document.getElementById(`op-${layer}`);
      const val    = document.getElementById(`opv-${layer}`);
      const oprow  = document.getElementById(`oprow-${layer}`);

      if (tog)    tog.checked         = state.layers[layer];
      if (swatch) swatch.style.background = state.colors[layer];
      if (slider) slider.value        = state.opacities[layer];
      if (val)    val.textContent     = state.opacities[layer] + '%';
      if (oprow)  oprow.style.display = state.layers[layer] ? '' : 'none';
    });
    const fc = document.getElementById('tog-fourcolors');
    if (fc) fc.checked = state.fourColors;
  }

  // ── Bind events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    // Layer toggles
    LAYERS.forEach(layer => {
      document.getElementById(`tog-${layer}`)?.addEventListener('change', (e) => {
        state.layers[layer] = e.target.checked;
        const oprow = document.getElementById(`oprow-${layer}`);
        if (oprow) oprow.style.display = e.target.checked ? '' : 'none';
      });

      // Opacidad — actualiza label en tiempo real
      document.getElementById(`op-${layer}`)?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.opacities[layer] = val;
        const el = document.getElementById(`opv-${layer}`);
        if (el) el.textContent = val + '%';
      });

      // Swatch → color picker nativo
      document.getElementById(`swatch-${layer}`)?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type  = 'color';
        input.value = state.colors[layer];
        input.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(input);
        input.click();
        input.addEventListener('input', (e) => {
          state.colors[layer] = e.target.value;
          document.getElementById(`swatch-${layer}`).style.background = e.target.value;
        });
        input.addEventListener('change', () => { input.remove(); });
      });
    });

    // Cuatro colores
    document.getElementById('tog-fourcolors')?.addEventListener('change', (e) => {
      state.fourColors = e.target.checked;
    });

    // Botón Aplicar → envía estado al content script y muestra el panel
    document.getElementById('btn-apply')?.addEventListener('click', () => {
      saveAndPush();
      // Pedir al content script que muestre el panel si estaba oculto
      chrome.runtime.sendMessage({ type: 'PUSH_TO_CONTENT', payload: state });
      const btn = document.getElementById('btn-apply');
      btn.textContent = '✓ Aplicado';
      setTimeout(() => { btn.textContent = 'Aplicar en mapa'; }, 1500);
    });

    // Botón OSM
    document.getElementById('btn-osm')?.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || '';
        const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);
        const lat  = match ? parseFloat(match[1]) : -34.6;
        const lng  = match ? parseFloat(match[2]) : -58.4;
        const zoom = match ? parseFloat(match[3]) : 6;
        chrome.runtime.sendMessage({ type: 'OPEN_OSM', lat, lng, zoom });
      });
    });
  }

  // ── Detectar si estamos en Google Maps ─────────────────────────────────────
  function checkTabStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || '';
      const isGMaps = url.includes('google.com/maps') || url.includes('maps.google.com');
      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      const info = document.getElementById('info-box');

      if (isGMaps) {
        dot?.classList.replace('inactive', 'active');
        if (text) text.textContent = 'Google Maps detectado ✓';
        if (info) { info.style.display = ''; info.textContent = '✓ Overlay activo en esta pestaña'; }
      } else {
        if (text) text.textContent = 'Abrí Google Maps para usar el overlay';
        if (info) info.style.display = 'none';
      }
    });
  }

})();
