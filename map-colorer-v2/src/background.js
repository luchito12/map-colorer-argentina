// Map Colorer Argentina — Background Service Worker
// Maneja persistencia de estado entre popup y content script

const DEFAULT_STATE = {
  layers: { provincias: true, municipios: false, barrios: false, regiones: false },
  colors: { provincias: '#378ADD', municipios: '#D85A30', barrios: '#639922', regiones: '#BA7517' },
  opacities: { provincias: 30, municipios: 35, barrios: 40, regiones: 25 },
  fourColors: false,
  panelVisible: true
};

// Al instalar, setear estado default
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['layers'], (data) => {
    // Solo setear defaults si no hay nada guardado
    if (!data.layers) {
      chrome.storage.local.set(DEFAULT_STATE);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(
      ['layers', 'colors', 'opacities', 'fourColors', 'panelVisible'],
      (data) => {
        // Merge con defaults para campos faltantes
        const result = {
          layers: { ...DEFAULT_STATE.layers, ...(data.layers || {}) },
          colors: { ...DEFAULT_STATE.colors, ...(data.colors || {}) },
          opacities: { ...DEFAULT_STATE.opacities, ...(data.opacities || {}) },
          fourColors: data.fourColors ?? DEFAULT_STATE.fourColors,
          panelVisible: data.panelVisible ?? DEFAULT_STATE.panelVisible
        };
        sendResponse(result);
      }
    );
    return true; // async
  }

  if (msg.type === 'SET_STATE') {
    chrome.storage.local.set(msg.payload, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Popup le manda estado nuevo al content script de la tab activa
  if (msg.type === 'PUSH_TO_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'UPDATE_STATE',
          payload: msg.payload
        }, () => {
          // Ignorar error si el content script no está en esa tab
          if (chrome.runtime.lastError) {}
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: false });
      }
    });
    return true;
  }

  // Content script pide abrir OSM en nueva pestaña
  if (msg.type === 'OPEN_OSM') {
    const url = chrome.runtime.getURL('popup/osm.html') +
      `?lat=${msg.lat}&lng=${msg.lng}&zoom=${msg.zoom}`;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }
});
