// Map Colorer Argentina — Content Script v1.5
// Patrones cartográficos, localidades por provincia→depto, tooltips adaptativos

(function () {
  'use strict';
  if (window.__mapColorerLoaded) return;
  window.__mapColorerLoaded = true;

  (function() {
    const _e = console.error.bind(console);
    console.error = function(...a) {
      const m = typeof a[0]==='string' ? a[0] : '';
      if (m.includes('GL_INVALID')||m.includes('glUniform')||
          m.includes('WebGL')||m.includes('preloadResponse')) return;
      _e(...a);
    };
  })();

  // ── Estado ───────────────────────────────────────────────────────────────────
  let state = {
    layers:    { provincias:true, municipios:false, barrios:false, regiones:false,
                 rios:false, lagos:false, lagunas:false, canales:false, diques:false },
    colors:    { provincias:'#3399FF', municipios:'#FF6633', barrios:'#66AA00', regiones:'#CC8800',
                 rios:'#1565C0', lagos:'#0288D1', lagunas:'#29B6F6', canales:'#0097A7', diques:'#4527A0' },
    opacities: { provincias:40, municipios:40, barrios:45, regiones:30,
                 rios:60, lagos:65, lagunas:60, canales:50, diques:80 },
    patterns:  { provincias:'solid', municipios:'solid', barrios:'solid', regiones:'solid',
                 rios:'solid', lagos:'solid', lagunas:'solid', canales:'solid', diques:'solid' },
    fourColors: false,
    panelVisible: true
  };

  const GEO = {};
  let locIndex = {};      // dept_id → [nombres]
  let locHierarchy = {};  // slug → {nombre, depts:{id→{nombre,locs}}}
  let canvas, ctx, hitCanvas, hitCtx, patternCanvas;
  let rafId = null, lastUrlHash = '', isDragging = false;
  let colorIndex = {};
  let activeProv = null;
  // Localidades panel state
  let locProv = null, locDept = null;
  let locMarkers = [];

  const LAYER_FILES = {
    provincias:'provincias.geojson', municipios:'municipios_arg.geojson',
    barrios:'barrios.geojson',       regiones:'regiones.geojson',
    rios:'rios_area.geojson',        lagos:'lagos_embalses.geojson',
    lagunas:'lagunas.geojson',       canales:'canales.geojson',
    diques:'diques.geojson'
  };
  const LAYER_LABELS = {
    provincias:'Provincia', municipios:'Municipio / Departamento',
    barrios:'Barrio',       regiones:'Región Geográfica',
    rios:'Río / Corriente', lagos:'Lago / Embalse',
    canales:'Canal',        diques:'Dique'
  };
  const MUNI_BY_PROV = {
    'buenos_aires':'Buenos Aires','caba':'CABA','catamarca':'Catamarca',
    'chaco':'Chaco','chubut':'Chubut','cordoba':'Córdoba',
    'corrientes':'Corrientes','entre_rios':'Entre Ríos','formosa':'Formosa',
    'jujuy':'Jujuy','la_pampa':'La Pampa','la_rioja':'La Rioja',
    'mendoza':'Mendoza','misiones':'Misiones','neuquen':'Neuquén',
    'rio_negro':'Río Negro','salta':'Salta','san_juan':'San Juan',
    'san_luis':'San Luis','santa_cruz':'Santa Cruz','santa_fe':'Santa Fe',
    'santiago_del_estero':'Santiago del Estero',
    'tierra_del_fuego':'Tierra del Fuego','tucuman':'Tucumán'
  };

  // ── Patrones cartográficos ────────────────────────────────────────────────────
  // Cada patrón se dibuja en un OffscreenCanvas y se convierte en CanvasPattern
  const PATTERN_CACHE = {};

  function makePattern(type, color) {
    const key = `${type}_${color}`;
    if (PATTERN_CACHE[key]) return PATTERN_CACHE[key];

    const size = 12;
    const pc = document.createElement('canvas');
    pc.width = size; pc.height = size;
    const px = pc.getContext('2d');
    px.clearRect(0,0,size,size);

    const r = parseInt(color.slice(1,3),16);
    const g = parseInt(color.slice(3,5),16);
    const b = parseInt(color.slice(5,7),16);
    const fill = `rgba(${r},${g},${b},0.85)`;
    const thin = `rgba(${r},${g},${b},0.5)`;

    switch(type) {
      case 'hlines': // Líneas horizontales (sombreado clásico)
        px.strokeStyle = fill; px.lineWidth = 1.5;
        for (let y=0; y<size; y+=4) {
          px.beginPath(); px.moveTo(0,y+0.5); px.lineTo(size,y+0.5); px.stroke();
        }
        break;
      case 'vlines': // Líneas verticales
        px.strokeStyle = fill; px.lineWidth = 1.5;
        for (let x=0; x<size; x+=4) {
          px.beginPath(); px.moveTo(x+0.5,0); px.lineTo(x+0.5,size); px.stroke();
        }
        break;
      case 'crosshatch': // Cuadriculado (muy común en cartografía)
        px.strokeStyle = fill; px.lineWidth = 1;
        for (let y=0; y<size; y+=4) {
          px.beginPath(); px.moveTo(0,y+0.5); px.lineTo(size,y+0.5); px.stroke();
        }
        for (let x=0; x<size; x+=4) {
          px.beginPath(); px.moveTo(x+0.5,0); px.lineTo(x+0.5,size); px.stroke();
        }
        break;
      case 'diag': // Diagonal (rayado oblicuo — muy usado en cartografía)
        px.strokeStyle = fill; px.lineWidth = 1.5;
        for (let i=-size; i<size*2; i+=5) {
          px.beginPath(); px.moveTo(i,0); px.lineTo(i+size,size); px.stroke();
        }
        break;
      case 'diag_inv': // Diagonal inversa
        px.strokeStyle = fill; px.lineWidth = 1.5;
        for (let i=-size; i<size*2; i+=5) {
          px.beginPath(); px.moveTo(i,size); px.lineTo(i+size,0); px.stroke();
        }
        break;
      case 'dots': // Punteado (muy usado para zonas de influencia)
        px.fillStyle = fill;
        for (let x=2; x<size; x+=5) {
          for (let y=2; y<size; y+=5) {
            px.beginPath(); px.arc(x,y,1.2,0,Math.PI*2); px.fill();
          }
        }
        break;
      // solid: sin patrón (default)
    }

    const pat = ctx ? ctx.createPattern(pc,'repeat') : null;
    if (pat) PATTERN_CACHE[key] = pat;
    return pat;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    await waitForMap();
    await loadStateFromStorage();
    createCanvas();
    createPanel();
    createTooltip();
    attachMapListeners();
    await Promise.all([preloadGeoJSON(), loadLocData()]);
    render();
  }

  function waitForMap() {
    return new Promise(resolve => {
      const check = () => {
        if (document.querySelector('#scene-container,div[role="main"],div[jsaction*="mousemove"]'))
          resolve();
        else setTimeout(check, 400);
      };
      check();
    });
  }

  // ── Storage ──────────────────────────────────────────────────────────────────
  function loadStateFromStorage() {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({type:'GET_STATE'}, (data) => {
          if (chrome.runtime.lastError||!data) { resolve(); return; }
          if (data.layers)    state.layers    = {...state.layers,    ...data.layers};
          if (data.colors)    state.colors    = {...state.colors,    ...data.colors};
          if (data.opacities) state.opacities = {...state.opacities, ...data.opacities};
          if (data.patterns)  state.patterns  = {...state.patterns,  ...data.patterns};
          if (data.fourColors!==undefined)   state.fourColors   = data.fourColors;
          if (data.panelVisible!==undefined) state.panelVisible = data.panelVisible;
          resolve();
        });
      } catch(e) { resolve(); }
    });
  }

  function saveState() {
    try {
      chrome.runtime.sendMessage({type:'SET_STATE', payload:{
        layers:state.layers, colors:state.colors, opacities:state.opacities,
        patterns:state.patterns, fourColors:state.fourColors, panelVisible:state.panelVisible
      }});
    } catch(e) {}
  }

  // ── GeoJSON ──────────────────────────────────────────────────────────────────
  async function loadLocData() {
    try {
      const [r1,r2] = await Promise.all([
        fetch(chrome.runtime.getURL('assets/geo/loc_by_dept.json')),
        fetch(chrome.runtime.getURL('assets/geo/localidades_idx.json'))
      ]);
      if (r1.ok) locIndex     = await r1.json();
      if (r2.ok) locHierarchy = await r2.json();
    } catch(e) {}
  }

  async function preloadGeoJSON() {
    for (const [layer, file] of Object.entries(LAYER_FILES)) {
      if (GEO[layer]) continue;
      try {
        const res = await fetch(chrome.runtime.getURL(`assets/geo/${file}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        GEO[layer] = await res.json();
        const el = document.getElementById(`mc-count-${layer}`);
        if (el) el.textContent = GEO[layer].features.length;
      } catch(e) { console.warn(`[MapColorer] ${file}:`, e.message); }
    }
  }

  async function loadMuniByProv(slug) {
    const key = `muni_${slug}`;
    if (GEO[key]) return true;
    try {
      const res = await fetch(chrome.runtime.getURL(`assets/geo/municipios/muni_${slug}.geojson`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      GEO[key] = await res.json();
      return true;
    } catch(e) { return false; }
  }

  // ── Canvas ────────────────────────────────────────────────────────────────────
  function createCanvas() {
    document.getElementById('mc-canvas-overlay')?.remove();
    document.getElementById('mc-hit-canvas')?.remove();
    const dpr=window.devicePixelRatio||1, W=window.innerWidth, H=window.innerHeight;

    canvas = document.createElement('canvas');
    canvas.id='mc-canvas-overlay';
    canvas.width=W*dpr; canvas.height=H*dpr;
    canvas.style.cssText=`position:fixed;top:0;left:0;width:${W}px;height:${H}px;pointer-events:none;z-index:2147483646;`;
    document.documentElement.appendChild(canvas);
    ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    hitCanvas = document.createElement('canvas');
    hitCanvas.id='mc-hit-canvas';
    hitCanvas.width=W*dpr; hitCanvas.height=H*dpr;
    hitCanvas.style.cssText='position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
    document.documentElement.appendChild(hitCanvas);
    hitCtx = hitCanvas.getContext('2d',{willReadFrequently:true});
    hitCtx.scale(dpr,dpr);

    window.addEventListener('resize',()=>{
      const dpr2=window.devicePixelRatio||1, W2=window.innerWidth, H2=window.innerHeight;
      canvas.width=W2*dpr2; canvas.height=H2*dpr2;
      canvas.style.width=W2+'px'; canvas.style.height=H2+'px';
      hitCanvas.width=W2*dpr2; hitCanvas.height=H2*dpr2;
      ctx=canvas.getContext('2d'); hitCtx=hitCanvas.getContext('2d',{willReadFrequently:true});
      ctx.scale(dpr2,dpr2); hitCtx.scale(dpr2,dpr2);
      Object.keys(PATTERN_CACHE).forEach(k=>delete PATTERN_CACHE[k]); // invalidar caché
      render();
    });
  }

  // ── Proyección Mercator ───────────────────────────────────────────────────────
  function getMapBounds() {
    const href = location.href;
    let lat, lng, zoom;

    // Formato 1: @lat,lng,ZOOMz  (zoom normal)
    const mz = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);
    if (mz) {
      lat=parseFloat(mz[1]); lng=parseFloat(mz[2]); zoom=parseFloat(mz[3]);
    } else {
      // Formato 2: @lat,lng,METROSm  (zoom muy alto, ej: 500m)
      // convertir metros a zoom: zoom = log2(156543 * cos(lat) / metros_por_pixel)
      // Google usa: metros_display → zoom ≈ log2(40075016 / (metros * 256 / ancho_pantalla))
      const mm = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)m/);
      if (!mm) return null;
      lat=parseFloat(mm[1]); lng=parseFloat(mm[2]);
      const metros=parseFloat(mm[3]);
      const W=window.innerWidth;
      // Calcular zoom equivalente desde el ancho visible en metros
      // metros es el ancho visible aprox; zoom = log2(circumferencia_ecuador * cos(lat) * W / (256 * metros))
      const cosLat = Math.cos(lat * Math.PI / 180);
      zoom = Math.log2(40075016.686 * cosLat * W / (256 * metros));
    }

    const TILE=256, scale=Math.pow(2,zoom), W=window.innerWidth, H=window.innerHeight;
    const lngD=(W/(TILE*scale))*360;
    const latR=lat*Math.PI/180, mercY=Math.log(Math.tan(Math.PI/4+latR/2));
    const mercD=(H/(TILE*scale))*(2*Math.PI);
    const north=(2*Math.atan(Math.exp(mercY+mercD/2))-Math.PI/2)*180/Math.PI;
    const south=(2*Math.atan(Math.exp(mercY-mercD/2))-Math.PI/2)*180/Math.PI;
    return {north,south,east:lng+lngD/2,west:lng-lngD/2,centerLat:lat,centerLng:lng,zoom};
  }

  const merc = d => Math.log(Math.tan(Math.PI/4+d*Math.PI/360));
  function ll2xy(lat,lng,b) {
    return {
      x:((lng-b.west)/(b.east-b.west))*window.innerWidth,
      y:(1-(merc(lat)-merc(b.south))/(merc(b.north)-merc(b.south)))*window.innerHeight
    };
  }
  function xy2ll(x,y,b) {
    const lng=b.west+(x/window.innerWidth)*(b.east-b.west);
    const mT=merc(b.north),mB=merc(b.south),mN=mT-(y/window.innerHeight)*(mT-mB);
    return {lat:(2*Math.atan(Math.exp(mN))-Math.PI/2)*180/Math.PI,lng};
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx||!hitCtx) return;
    const dpr=window.devicePixelRatio||1,W=window.innerWidth,H=window.innerHeight;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W*dpr,H*dpr); ctx.scale(dpr,dpr);
    hitCtx.setTransform(1,0,0,1,0,0); hitCtx.clearRect(0,0,W*dpr,H*dpr); hitCtx.scale(dpr,dpr);
    colorIndex={}; let hitN=1;

    const bounds=getMapBounds(); if(!bounds) return;

    const drawSet=(features,layerName)=>{
      const alpha=state.opacities[layerName]/100;
      const base=state.colors[layerName];
      const pat=state.patterns[layerName];
      const cmap=state.fourColors?fourColors(features):null;
      for (let i=0;i<features.length;i++) {
        const fill=cmap?cmap[i]:base;
        drawFeat(features[i],fill,alpha,pat,bounds,false);
        const hc=idxToColor(hitN);
        colorIndex[hc]={feature:features[i],layer:layerName};
        drawFeat(features[i],hc,1,'solid',bounds,true);
        hitN++;
      }
    };

    for (const layer of ['regiones','provincias','municipios','barrios',
                          'rios','lagos','lagunas','canales','diques']) {
      if (!state.layers[layer]||!GEO[layer]) continue;
      drawSet(GEO[layer].features,layer);
    }
    if (activeProv&&GEO[`muni_${activeProv}`])
      drawSet(GEO[`muni_${activeProv}`].features,'municipios');

    // Renderizar marcadores de localidades si hay activos
    renderLocMarkers(bounds);
  }

  function drawFeat(feature,color,alpha,patType,bounds,isHit) {
    const geom=feature.geometry; if(!geom) return;
    const target=isHit?hitCtx:ctx;
    const W=window.innerWidth, H=window.innerHeight;

    // ── Polígonos (provincias, municipios, ríos área, lagos) ─────────────────
    if (geom.type==='Polygon'||geom.type==='MultiPolygon') {
      const rings=geom.type==='Polygon'?[geom.coordinates[0]]:geom.coordinates.map(p=>p[0]);
      for (const ring of rings) {
        if (!ring||ring.length<3) continue;
        const path=new Path2D();
        let first=true,vis=false;
        for (const c of ring) {
          const {x,y}=ll2xy(c[1],c[0],bounds);
          first?(path.moveTo(x,y),first=false):path.lineTo(x,y);
          if(x>-500&&x<W+500&&y>-500&&y<H+500) vis=true;
        }
        if(first||!vis) continue;
        path.closePath();
        if (isHit) {
          target.globalAlpha=1; target.fillStyle=color; target.fill(path);
        } else {
          target.globalAlpha=alpha*0.4; target.fillStyle=color; target.fill(path);
          if (patType&&patType!=='solid') {
            const pat=makePattern(patType,color);
            if (pat){target.globalAlpha=alpha;target.fillStyle=pat;target.fill(path);}
          } else {
            target.globalAlpha=alpha*0.6; target.fillStyle=color; target.fill(path);
          }
          target.globalAlpha=Math.min(alpha*2.8,0.9);
          target.strokeStyle=darken(color,55); target.lineWidth=1.2; target.stroke(path);
          target.globalAlpha=1;
        }
      }
    }

    // ── Líneas (canales, ríos línea) ──────────────────────────────────────────
    else if (geom.type==='LineString'||geom.type==='MultiLineString') {
      const lines=geom.type==='LineString'?[geom.coordinates]:geom.coordinates;
      for (const line of lines) {
        if (!line||line.length<2) continue;
        const path=new Path2D();
        let first=true,vis=false;
        for (const c of line) {
          const {x,y}=ll2xy(c[1],c[0],bounds);
          first?(path.moveTo(x,y),first=false):path.lineTo(x,y);
          if(x>-500&&x<W+500&&y>-500&&y<H+500) vis=true;
        }
        if(first||!vis) continue;
        if (isHit) {
          target.globalAlpha=1; target.strokeStyle=color; target.lineWidth=6; target.stroke(path);
        } else {
          target.globalAlpha=alpha; target.strokeStyle=color; target.lineWidth=1.8;
          target.lineCap='round'; target.lineJoin='round'; target.stroke(path);
          target.globalAlpha=1;
        }
      }
    }

    // ── Puntos (diques) ───────────────────────────────────────────────────────
    else if (geom.type==='Point') {
      const {x,y}=ll2xy(geom.coordinates[1],geom.coordinates[0],bounds);
      if (x<-20||x>W+20||y<-20||y>H+20) return;
      const r=isHit?5:4;
      const path=new Path2D();
      path.arc(x,y,r,0,Math.PI*2);
      if (isHit) {
        target.globalAlpha=1; target.fillStyle=color; target.fill(path);
      } else {
        target.globalAlpha=alpha; target.fillStyle=color; target.fill(path);
        target.globalAlpha=Math.min(alpha+0.3,1); target.strokeStyle='#fff';
        target.lineWidth=1.5; target.stroke(path); target.globalAlpha=1;
      }
    }
  }

  // ── Marcadores de localidades ─────────────────────────────────────────────────
  function renderLocMarkers(bounds) {
    if (!locMarkers||locMarkers.length===0) return;
    for (const loc of locMarkers) {
      const {x,y}=ll2xy(loc.lat,loc.lon,bounds);
      if (x<-10||x>window.innerWidth+10||y<-10||y>window.innerHeight+10) continue;

      // Círculo relleno
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#CC0000';
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
      ctx.stroke();

      // Nombre si hay zoom suficiente
      const b=getMapBounds();
      if (b&&b.zoom>=10) {
        ctx.globalAlpha=1;
        ctx.fillStyle='#202124';
        ctx.font='bold 11px Google Sans,Arial';
        ctx.textAlign='left';
        ctx.strokeStyle='rgba(255,255,255,0.85)';
        ctx.lineWidth=3;
        ctx.strokeText(loc.nombre,x+6,y+4);
        ctx.fillText(loc.nombre,x+6,y+4);
      }
      ctx.globalAlpha=1;
    }
  }

  function idxToColor(i){
    return '#'+[(i>>16)&0xFF,(i>>8)&0xFF,i&0xFF].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function darken(hex,amt){
    if(!hex||hex.length<7) return '#000';
    return '#'+[1,3,5].map(i=>Math.max(0,parseInt(hex.slice(i,i+2),16)-amt).toString(16).padStart(2,'0')).join('');
  }

  // ── 4 colores ─────────────────────────────────────────────────────────────────
  function fourColors(features){
    const FOUR=['#E63946','#457B9D','#2D9E6B','#E9C46A'];
    const adj={},map={};
    for(let i=0;i<features.length;i++) adj[i]=[];
    for(let i=0;i<features.length;i++){
      const b1=bbox(features[i]); if(!b1) continue;
      for(let j=i+1;j<features.length;j++){
        const b2=bbox(features[j]); if(!b2) continue;
        if(b1.x2>=b2.x1&&b2.x2>=b1.x1&&b1.y2>=b2.y1&&b2.y2>=b1.y1){adj[i].push(j);adj[j].push(i);}
      }
    }
    for(let i=0;i<features.length;i++){
      const used=new Set((adj[i]||[]).map(j=>map[j]).filter(Boolean));
      map[i]=FOUR.find(c=>!used.has(c))||FOUR[0];
    }
    return map;
  }
  function bbox(f){
    const g=f.geometry; if(!g) return null;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    const coords=rings.flat(); if(!coords.length) return null;
    return{x1:Math.min(...coords.map(c=>c[0])),x2:Math.max(...coords.map(c=>c[0])),
           y1:Math.min(...coords.map(c=>c[1])),y2:Math.max(...coords.map(c=>c[1]))};
  }

  // ── Listeners ────────────────────────────────────────────────────────────────
  function attachMapListeners(){
    setInterval(()=>{
      // Capturar tanto formato zoom (15z) como metros (500m)
      const h = (
        location.href.match(/@[^/,]*,[^/,]*,[^/@]*/)?.[0] || ''
      );
      if(h!==lastUrlHash){lastUrlHash=h;scheduleRender();}
    },100);
    document.addEventListener('wheel',()=>scheduleRender(),{passive:true});
    document.addEventListener('mouseup',()=>scheduleRender());
    document.addEventListener('touchend',()=>scheduleRender());
    document.addEventListener('click',()=>setTimeout(scheduleRender,250));
  }
  function scheduleRender(){
    if(rafId) cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(()=>{render();rafId=null;});
  }

  // ── Tooltip hit testing ───────────────────────────────────────────────────────
  function createTooltip(){
    document.getElementById('mc-tooltip')?.remove();
    const tt=document.createElement('div'); tt.id='mc-tooltip';
    document.documentElement.appendChild(tt);
    let lx=null,ly=null,timer=null;

    // useCapture:true = interceptamos ANTES que los listeners de Google Maps
    // Esto resuelve que el tooltip no aparezca sobre el mapa base sin abrir nada
    document.addEventListener('mousemove',(e)=>{
      lx=e.clientX; ly=e.clientY;
      if(timer) return;
      timer=setTimeout(()=>{timer=null;if(lx!==null)showTT(lx,ly);},25);
    }, true);  // <-- capture phase

    // También escuchar pointermove que Maps usa internamente
    document.addEventListener('pointermove',(e)=>{
      lx=e.clientX; ly=e.clientY;
      if(timer) return;
      timer=setTimeout(()=>{timer=null;if(lx!==null)showTT(lx,ly);},25);
    }, true);
  }

  function showTT(cx,cy){
    const tt=document.getElementById('mc-tooltip'); if(!tt) return;
    const panel=document.getElementById('mc-panel');
    if(panel){const r=panel.getBoundingClientRect();
      if(cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom){tt.classList.remove('visible');return;}}

    // No mostrar si el mouse está sobre un elemento interactivo de Google Maps
    // (fichas, botones, controles, paneles laterales)
    const elemUnder = document.elementFromPoint(cx, cy);
    if (elemUnder && elemUnder !== canvas && elemUnder !== hitCanvas) {
      // Permitir solo si es el body, html, o el canvas
      const tag = elemUnder.tagName.toLowerCase();
      const id  = elemUnder.id || '';
      const cls = (elemUnder.className || '').toString();
      // Elementos de Google Maps que bloquean: divs con roles, botones, links, inputs
      const isMapsUI = (
        tag === 'button' || tag === 'a' || tag === 'input' ||
        elemUnder.getAttribute('role') === 'button' ||
        elemUnder.getAttribute('role') === 'dialog' ||
        cls.includes('widget') || cls.includes('gm-') ||
        id.includes('omnibox') || id.includes('searchbox') ||
        elemUnder.closest('[role="dialog"]') ||
        elemUnder.closest('[role="main"] [style*="z-index"]')
      );
      if (isMapsUI) { tt.classList.remove('visible'); return; }
    }
    const dpr=window.devicePixelRatio||1;
    let hit=null;
    try{
      const d=hitCtx.getImageData(Math.round(cx*dpr),Math.round(cy*dpr),1,1).data;
      if(d[3]>0){
        const hx='#'+[0,1,2].map(i=>d[i].toString(16).padStart(2,'0')).join('');
        hit=colorIndex[hx];
      }
    }catch(e){}
    if(hit){
      tt.innerHTML=buildTT(hit.feature,hit.layer);
      tt.classList.add('visible');
      // Posición adaptativa — nunca sale de pantalla
      tt.style.left='-9999px'; tt.style.top='-9999px'; tt.style.visibility='hidden';
      requestAnimationFrame(()=>{
        const tw=tt.offsetWidth||240, th=tt.offsetHeight||150;
        const tx=cx+18+tw>window.innerWidth  ? cx-tw-10 : cx+18;
        const ty=cy- 5+th>window.innerHeight ? cy-th- 5 : cy-5;
        tt.style.left=tx+'px'; tt.style.top=ty+'px'; tt.style.visibility='visible';
      });
    } else {
      tt.classList.remove('visible');
    }
  }

  function fmtNum(n){return n?Number(n).toLocaleString('es-AR'):'—';}

  function buildTT(feature,layer){
    const p=feature.properties, name=p.nombre||'—';
    let h=`<div class="tt-title">${name}</div><div class="tt-sub">${LAYER_LABELS[layer]}</div>`;
    if(layer==='provincias'){
      if(p.capital)        h+=ttRow('Capital',    p.capital);
      if(p.region)         h+=ttRow('Región',     p.region);
      if(p.poblacion)      h+=ttRow('Población',  fmtNum(p.poblacion)+' hab.');
      if(p.superficie_km2) h+=ttRow('Superficie', fmtNum(p.superficie_km2)+' km²');
      if(p.iso_id)         h+=ttRow('ISO',        p.iso_id);
    } else if(layer==='municipios'){
      if(p.categoria) h+=ttRow('Tipo',      p.categoria);
      if(p.provincia) h+=ttRow('Provincia', p.provincia);
      const locs=locIndex[p.id];
      if(locs&&locs.length){
        const top=locs.slice(0,5).join(', ')+(locs.length>5?` y ${locs.length-5} más`:'');
        h+=ttRow('Localidades',top);
      }
    } else if(layer==='barrios'){
      if(p.comuna)  h+=ttRow('Comuna','N° '+p.comuna);
      if(p.area_m2) h+=ttRow('Área',(p.area_m2/1e6).toFixed(2)+' km²');
    } else if(layer==='regiones'){
      if(p.descripcion) h+=ttRow('Descripción',p.descripcion);
      if(p.provincias)  h+=ttRow('Provincias', p.provincias);
    } else {
      // Hidrografía — ríos, lagos, canales, diques
      if(p.tipo)   h+=ttRow('Tipo',   p.tipo);
      if(p.objeto && p.objeto!==p.tipo) h+=ttRow('Objeto', p.objeto);
    }
    return h;
  }
  const ttRow=(k,v)=>`<div class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></div>`;

  // ── Panel principal ───────────────────────────────────────────────────────────
  function createPanel(){
    document.getElementById('mc-panel')?.remove();
    const panel=document.createElement('div'); panel.id='mc-panel';
    if(!state.panelVisible) panel.style.display='none';

    panel.innerHTML=`
      <div id="mc-header">
        <span>🗺 Map Colorer AR</span>
        <div id="mc-header-btns">
          <button class="mc-icon-btn" id="mc-collapse-btn" title="Minimizar">−</button>
          <button class="mc-icon-btn" id="mc-close-btn" title="Cerrar">✕</button>
        </div>
      </div>
      <div id="mc-body">
        <div class="mc-status-row"><span class="mc-dot"></span><span id="mc-status-txt">Cargando…</span></div>

        <div class="mc-section-title">Capas</div>
        ${mkRow('provincias','Provincias')}
        ${mkRow('municipios','Municipios / Departamentos')}
        <div id="mc-prov-wrap" style="display:none;padding:2px 13px 5px 37px;">
          <select id="mc-prov-select" class="mc-select">
            <option value="">— Todas las provincias —</option>
          </select>
        </div>
        ${mkRow('barrios','Barrios CABA')}
        ${mkRow('regiones','Regiones')}

        <div class="mc-divider"></div>
        <div class="mc-section-title" style="padding-top:4px;">Hidrografía · IGN</div>
        ${mkRow('rios','Ríos y corrientes')}
        ${mkRow('lagos','Lagos y embalses')}
        ${mkRow('lagunas','Lagunas')}
        ${mkRow('canales','Canales')}
        ${mkRow('diques','Diques')}

        <div class="mc-divider"></div>

        <!-- Localidades -->
        <div class="mc-section-title">Localidades</div>
        <div style="padding:3px 13px 8px;">
          <select id="mc-loc-prov" class="mc-select" style="margin-bottom:5px;">
            <option value="">— Seleccioná provincia —</option>
          </select>
          <select id="mc-loc-dept" class="mc-select" style="display:none;">
            <option value="">— Seleccioná departamento —</option>
          </select>
          <div id="mc-loc-info" style="display:none;margin-top:5px;font-size:10px;color:#5f6368;padding:4px 6px;background:#f8f9fa;border-radius:5px;line-height:1.6;"></div>
          <button id="mc-loc-clear" style="display:none;margin-top:4px;width:100%;font-size:10px;padding:3px 0;border:1px solid #dadce0;border-radius:4px;background:#fff;color:#5f6368;cursor:pointer;">
            Limpiar localidades
          </button>
        </div>

        <div class="mc-divider"></div>

        <!-- Opciones -->
        <div class="mc-layer-row" style="padding:5px 13px;">
          <label class="mc-toggle">
            <input type="checkbox" id="tog-fourcolors" ${state.fourColors?'checked':''}>
            <span class="mc-toggle-track"></span>
          </label>
          <span style="font-size:11px;color:#5f6368;flex:1;margin-left:8px;">Auto 4 colores</span>
        </div>

        <div class="mc-footer">
          <button class="mc-btn" id="mc-osm-btn">OSM ↗</button>
          <button class="mc-btn mc-btn-primary" id="mc-apply-btn">Aplicar</button>
        </div>
        <div style="padding:0 13px 9px;">
          <button class="mc-btn" id="mc-geovisor-btn" style="width:100%;background:#e8f0fe;color:#1a73e8;border-color:#e8f0fe;font-size:11px;">
            Ver en GeoVisor IGN ↗
          </button>
        </div>
      </div>`;

    document.documentElement.appendChild(panel);
    bindPanel(panel);
    syncPanel();
    populateLocProvSelect();
  }

  function mkRow(id,label){
    const on=state.layers[id],op=state.opacities[id],col=state.colors[id],pat=state.patterns[id]||'solid';
    return `
      <div class="mc-layer-row">
        <div class="mc-swatch" id="mc-sw-${id}" style="background:${col}" data-layer="${id}" title="Color"></div>
        <span class="mc-layer-name">${label}</span>
        <span class="mc-layer-count" id="mc-count-${id}">–</span>
        <label class="mc-toggle">
          <input type="checkbox" id="tog-${id}" ${on?'checked':''} data-layer="${id}">
          <span class="mc-toggle-track"></span>
        </label>
      </div>
      <div class="mc-opacity-row" id="oprow-${id}" style="${on?'':'display:none'}">
        <label>Opac.</label>
        <input type="range" id="op-${id}" min="5" max="80" step="1" value="${op}" data-layer="${id}">
        <span class="mc-opacity-val" id="opval-${id}">${op}%</span>
      </div>
      <div class="mc-pattern-row" id="patrow-${id}" style="${on?'':'display:none'}">
        <label>Patrón</label>
        <select id="pat-${id}" class="mc-select-sm" data-layer="${id}">
          <option value="solid"    ${pat==='solid'    ?'selected':''}>Sólido</option>
          <option value="hlines"   ${pat==='hlines'   ?'selected':''}>Líneas H</option>
          <option value="vlines"   ${pat==='vlines'   ?'selected':''}>Líneas V</option>
          <option value="diag"     ${pat==='diag'     ?'selected':''}>Diagonal</option>
          <option value="diag_inv" ${pat==='diag_inv' ?'selected':''}>Diag. inv.</option>
          <option value="crosshatch"${pat==='crosshatch'?'selected':''}>Cuadriculado</option>
          <option value="dots"     ${pat==='dots'     ?'selected':''}>Puntos</option>
        </select>
      </div>`;
  }

  function bindPanel(panel){
    panel.querySelector('#mc-close-btn').onclick=()=>{
      panel.style.display='none'; state.panelVisible=false; saveState();
    };
    panel.querySelector('#mc-collapse-btn').onclick=(e)=>{
      const b=document.getElementById('mc-body'),hide=b.style.display!=='none';
      b.style.display=hide?'none':''; e.target.textContent=hide?'+':'−';
    };

    // Toggles
    panel.querySelectorAll('input[type=checkbox][data-layer]').forEach(inp=>{
      inp.onchange=()=>{
        const l=inp.dataset.layer; state.layers[l]=inp.checked;
        document.getElementById(`oprow-${l}`).style.display=inp.checked?'':'none';
        document.getElementById(`patrow-${l}`).style.display=inp.checked?'':'none';
        if(l==='municipios'){
          document.getElementById('mc-prov-wrap').style.display=inp.checked?'':'none';
          if(!inp.checked){activeProv=null;document.getElementById('mc-prov-select').value='';}
        }
        render(); saveState(); updateStatus();
      };
    });

    // Sliders de opacidad
    panel.querySelectorAll('input[type=range][data-layer]').forEach(sl=>{
      sl.oninput=()=>{
        const l=sl.dataset.layer; state.opacities[l]=parseInt(sl.value);
        document.getElementById(`opval-${l}`).textContent=sl.value+'%'; render();
      };
      sl.onchange=()=>saveState();
    });

    // Selectores de patrón
    panel.querySelectorAll('select.mc-select-sm[data-layer]').forEach(sel=>{
      sel.onchange=()=>{
        const l=sel.dataset.layer; state.patterns[l]=sel.value;
        render(); saveState();
      };
    });

    // Swatches
    panel.querySelectorAll('.mc-swatch[data-layer]').forEach(sw=>{
      sw.onclick=()=>openPicker(sw.dataset.layer,sw);
    });

    // Selector provincia para municipios
    const provSel=panel.querySelector('#mc-prov-select');
    Object.entries(MUNI_BY_PROV).forEach(([slug,label])=>{
      const opt=document.createElement('option'); opt.value=slug;
      opt.textContent=label; provSel.appendChild(opt);
    });
    provSel.onchange=async()=>{
      const slug=provSel.value; activeProv=slug||null;
      if(slug){
        state.layers.municipios=false;
        document.getElementById('tog-municipios').checked=false;
        document.getElementById('oprow-municipios').style.display='none';
        document.getElementById('patrow-municipios').style.display='none';
        document.getElementById('mc-count-municipios').textContent='…';
        await loadMuniByProv(slug);
        document.getElementById('mc-count-municipios').textContent=GEO[`muni_${slug}`]?.features.length||'?';
      } else {
        state.layers.municipios=true;
        document.getElementById('tog-municipios').checked=true;
        document.getElementById('oprow-municipios').style.display='';
        document.getElementById('patrow-municipios').style.display='';
        if(GEO['municipios'])
          document.getElementById('mc-count-municipios').textContent=GEO['municipios'].features.length;
      }
      render(); saveState();
    };

    // 4 colores
    panel.querySelector('#tog-fourcolors').onchange=(e)=>{
      state.fourColors=e.target.checked; render(); saveState();
    };

    // Localidades — selector provincia
    const locProvSel=panel.querySelector('#mc-loc-prov');
    locProvSel.onchange=()=>{
      const slug=locProvSel.value;
      locProv=slug||null; locDept=null; locMarkers=[];
      const deptSel=document.getElementById('mc-loc-dept');
      const info=document.getElementById('mc-loc-info');
      const clearBtn=document.getElementById('mc-loc-clear');
      deptSel.style.display='none';
      info.style.display='none';
      clearBtn.style.display='none';
      deptSel.innerHTML='<option value="">— Seleccioná departamento —</option>';

      if(!slug){render();return;}

      const provData=locHierarchy[slug];
      if(!provData){render();return;}

      // Poblar departamentos
      Object.entries(provData.depts).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre))
        .forEach(([did,ddata])=>{
          const opt=document.createElement('option'); opt.value=did;
          opt.textContent=`${ddata.nombre} (${ddata.locs.length})`;
          deptSel.appendChild(opt);
        });
      deptSel.style.display='';
    };

    // Localidades — selector departamento
    document.getElementById('mc-loc-dept').onchange=()=>{
      const deptId=document.getElementById('mc-loc-dept').value;
      const info=document.getElementById('mc-loc-info');
      const clearBtn=document.getElementById('mc-loc-clear');
      locDept=deptId||null; locMarkers=[];

      if(!locProv||!deptId){info.style.display='none';clearBtn.style.display='none';render();return;}

      const ddata=locHierarchy[locProv]?.depts?.[deptId];
      if(!ddata){render();return;}

      // Activar marcadores
      locMarkers=ddata.locs.map(l=>({nombre:l.n,lat:l.y,lon:l.x,cat:l.c}));

      // Mostrar lista en el panel
      const lista=locMarkers.map(l=>`• ${l.nombre}`).join('\n');
      info.textContent=`${locMarkers.length} localidades en ${ddata.nombre}:\n${lista}`;
      info.style.whiteSpace='pre-wrap';
      info.style.display='';
      clearBtn.style.display='';
      render();
    };

    document.getElementById('mc-loc-clear').onclick=()=>{
      locMarkers=[]; locDept=null;
      document.getElementById('mc-loc-dept').value='';
      document.getElementById('mc-loc-info').style.display='none';
      document.getElementById('mc-loc-clear').style.display='none';
      render();
    };

    panel.querySelector('#mc-apply-btn').onclick=()=>{
      render(); saveState();
      const btn=panel.querySelector('#mc-apply-btn');
      btn.textContent='✓'; setTimeout(()=>btn.textContent='Aplicar',1200);
    };
    panel.querySelector('#mc-osm-btn').onclick=()=>{
      const b=getMapBounds()||{};
      chrome.runtime.sendMessage({type:'OPEN_OSM',lat:b.centerLat||-34.6,lng:b.centerLng||-58.4,zoom:b.zoom||6});
    };

    panel.querySelector('#mc-geovisor-btn').onclick=()=>{
      const b=getMapBounds()||{};
      const zoom=Math.round(b.zoom||6);
      const lat=(b.centerLat||-38).toFixed(4);
      const lng=(b.centerLng||-63).toFixed(4);
      // GeoPortal IGN — pasa centro y zoom actual del mapa
      const url=`https://mapa.ign.gob.ar/?zoom=${zoom}&lat=${lat}&lon=${lng}`;
      window.open(url,'_blank');
    };
    makeDraggable(panel,panel.querySelector('#mc-header'));
  }

  function populateLocProvSelect(){
    const sel=document.getElementById('mc-loc-prov'); if(!sel) return;
    Object.entries(MUNI_BY_PROV).sort((a,b)=>a[1].localeCompare(b[1])).forEach(([slug,label])=>{
      const opt=document.createElement('option'); opt.value=slug; opt.textContent=label;
      sel.appendChild(opt);
    });
  }

  function syncPanel(){
    ['provincias','municipios','barrios','regiones','rios','lagos','lagunas','canales','diques'].forEach(l=>{
      const tog=document.getElementById(`tog-${l}`);
      const sw=document.getElementById(`mc-sw-${l}`);
      const sl=document.getElementById(`op-${l}`);
      const val=document.getElementById(`opval-${l}`);
      const row=document.getElementById(`oprow-${l}`);
      const prow=document.getElementById(`patrow-${l}`);
      const patSel=document.getElementById(`pat-${l}`);
      if(tog) tog.checked=state.layers[l];
      if(sw)  sw.style.background=state.colors[l];
      if(sl)  sl.value=state.opacities[l];
      if(val) val.textContent=state.opacities[l]+'%';
      if(row) row.style.display=state.layers[l]?'':'none';
      if(prow) prow.style.display=state.layers[l]?'':'none';
      if(patSel) patSel.value=state.patterns[l]||'solid';
    });
    const fc=document.getElementById('tog-fourcolors');
    if(fc) fc.checked=state.fourColors;
  }

  function updateStatus(){
    const el=document.getElementById('mc-status-txt'); if(!el) return;
    const active=Object.keys(state.layers).filter(k=>state.layers[k]);
    el.textContent=active.length?active.join(', '):'Sin capas activas';
    ['provincias','municipios','barrios','regiones','rios','lagos','lagunas','canales','diques'].forEach(l=>{
      const c=document.getElementById(`mc-count-${l}`);
      if(c&&GEO[l]) c.textContent=GEO[l].features.length;
    });
  }

  // ── Color Picker ──────────────────────────────────────────────────────────────
  const PALETTE=['#3399FF','#1A73E8','#0D47A1','#FF6633','#E53935','#B71C1C',
                 '#66AA00','#1D9E75','#1B5E20','#CC8800','#F9A825','#E65100',
                 '#D4537E','#7F77DD','#888780'];
  let pickerEl=null;
  function openPicker(layer,anchor){
    pickerEl?.remove();
    pickerEl=document.createElement('div'); pickerEl.className='mc-colorpicker';
    PALETTE.forEach(color=>{
      const dot=document.createElement('div');
      dot.className='mc-color-dot'+(color===state.colors[layer]?' active':'');
      dot.style.background=color;
      dot.onclick=(e)=>{
        e.stopPropagation(); state.colors[layer]=color; anchor.style.background=color;
        pickerEl.remove(); pickerEl=null; render(); saveState();
      };
      pickerEl.appendChild(dot);
    });
    const r=anchor.getBoundingClientRect();
    Object.assign(pickerEl.style,{position:'fixed',left:(r.right+8)+'px',top:(r.top-5)+'px',zIndex:'2147483647'});
    document.documentElement.appendChild(pickerEl);
    setTimeout(()=>{
      document.addEventListener('click',function close(e){
        if(!pickerEl?.contains(e.target)){pickerEl?.remove();pickerEl=null;document.removeEventListener('click',close);}
      });
    },0);
  }

  // ── Draggable ─────────────────────────────────────────────────────────────────
  function makeDraggable(el,handle){
    let sx,sy,sl,st;
    handle.addEventListener('mousedown',(e)=>{
      if(e.target.closest('.mc-icon-btn')) return;
      isDragging=true; const r=el.getBoundingClientRect();
      sx=e.clientX;sy=e.clientY;sl=r.left;st=r.top; e.preventDefault();
    });
    document.addEventListener('mousemove',(e)=>{
      if(!isDragging) return;
      el.style.left=(sl+e.clientX-sx)+'px'; el.style.top=(st+e.clientY-sy)+'px'; el.style.right='auto';
    });
    document.addEventListener('mouseup',()=>{isDragging=false;});
  }

  // ── Mensajes popup ────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg)=>{
    if(msg.type==='UPDATE_STATE'){
      if(msg.payload.layers)    state.layers    ={...state.layers,    ...msg.payload.layers};
      if(msg.payload.colors)    state.colors    ={...state.colors,    ...msg.payload.colors};
      if(msg.payload.opacities) state.opacities ={...state.opacities, ...msg.payload.opacities};
      if(msg.payload.patterns)  state.patterns  ={...state.patterns,  ...msg.payload.patterns};
      if(msg.payload.fourColors!==undefined) state.fourColors=msg.payload.fourColors;
      const p=document.getElementById('mc-panel');
      if(p){p.style.display='';syncPanel();} state.panelVisible=true;
      render(); updateStatus();
    }
  });

  init().then(updateStatus);
})();
