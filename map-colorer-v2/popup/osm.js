// Map Colorer Argentina — OSM v1.5
// Fix: patrones via SVG defs, botón GeoVisor, localidades correctas

(function () {
  'use strict';
  const params=new URLSearchParams(location.search);
  const initLat=parseFloat(params.get('lat'))||-38.0;
  const initLng=parseFloat(params.get('lng'))||-63.0;
  const initZoom=Math.round(parseFloat(params.get('zoom'))||5);

  const map=L.map('map').setView([initLat,initLng],initZoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:19
  }).addTo(map);

  // ── Estado ────────────────────────────────────────────────────────────────────
  const LS={
    provincias:{color:'#3399FF',opacity:0.40,active:true, geo:null,lyr:null,pat:'solid'},
    municipios:{color:'#FF6633',opacity:0.40,active:false,geo:null,lyr:null,pat:'solid'},
    barrios:   {color:'#66AA00',opacity:0.45,active:false,geo:null,lyr:null,pat:'solid'},
    regiones:  {color:'#CC8800',opacity:0.30,active:false,geo:null,lyr:null,pat:'solid'},
    rios:      {color:'#1565C0',opacity:0.60,active:false,geo:null,lyr:null,pat:'solid'},
    lagos:     {color:'#0288D1',opacity:0.65,active:false,geo:null,lyr:null,pat:'solid'},
    lagunas:   {color:'#29B6F6',opacity:0.60,active:false,geo:null,lyr:null,pat:'solid'},
    canales:   {color:'#0097A7',opacity:0.50,active:false,geo:null,lyr:null,pat:'solid'},
    diques:    {color:'#4527A0',opacity:0.80,active:false,geo:null,lyr:null,pat:'solid'},
  };
  const GEO_FILES={
    provincias:'provincias.geojson', municipios:'municipios_arg.geojson',
    barrios:'barrios.geojson',       regiones:'regiones.geojson',
    rios:'rios_area.geojson',        lagos:'lagos_embalses.geojson',
    lagunas:'lagunas.geojson',       canales:'canales.geojson',
    diques:'diques.geojson'
  };
  const MUNI_BY_PROV={
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
  const LAYER_LABELS={
    provincias:'Provincia',    municipios:'Municipio / Departamento',
    barrios:'Barrio',          regiones:'Región Geográfica',
    rios:'Río / Corriente',    lagos:'Lago / Embalse',
    lagunas:'Laguna',          canales:'Canal',
    diques:'Dique'
  };
  // Slugs IGN para GeoVisor
  const GEOVISOR_IDS={
    'buenos_aires':'06','caba':'02','catamarca':'10','chaco':'22',
    'chubut':'26','cordoba':'14','corrientes':'18','entre_rios':'30',
    'formosa':'34','jujuy':'38','la_pampa':'42','la_rioja':'46',
    'mendoza':'50','misiones':'54','neuquen':'58','rio_negro':'62',
    'salta':'66','san_juan':'70','san_luis':'74','santa_cruz':'78',
    'santa_fe':'82','santiago_del_estero':'86','tierra_del_fuego':'94','tucuman':'90'
  };

  const GEO_CACHE={};
  let locIndex={}, locHierarchy={};
  let useFourColors=false, activeProv=null, provLyr=null;
  let locLayerGroup=L.layerGroup().addTo(map);

  // ── SVG Pattern System ────────────────────────────────────────────────────────
  // Leaflet usa SVG internamente. Inyectamos <defs> con patrones SVG reales.
  // Cada patrón tiene un ID único por color+tipo y se referencia con fill="url(#id)"

  let svgDefs = null;

  function getSVGDefs() {
    // Buscar el SVG que Leaflet crea para los paths
    if (svgDefs) return svgDefs;
    const svgEl = document.querySelector('.leaflet-overlay-pane svg');
    if (!svgEl) return null;
    svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgEl.insertBefore(svgDefs, svgEl.firstChild);
    return svgDefs;
  }

  function ensurePattern(type, color) {
    if (type === 'solid' || !type) return null;
    const id = `mc_pat_${type}_${color.replace('#','')}`;
    // Si ya existe, devolver el id
    if (document.getElementById(id)) return id;
    const defs = getSVGDefs();
    if (!defs) return null;

    const size = 10;
    const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pat.setAttribute('id', id);
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width', size);
    pat.setAttribute('height', size);

    // Fondo levemente coloreado
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', size); bg.setAttribute('height', size);
    bg.setAttribute('fill', color); bg.setAttribute('opacity', '0.15');
    pat.appendChild(bg);

    const stroke = color;
    const sw = '1.5';

    const addLine = (x1,y1,x2,y2) => {
      const l = document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1',x1); l.setAttribute('y1',y1);
      l.setAttribute('x2',x2); l.setAttribute('y2',y2);
      l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', sw);
      l.setAttribute('opacity','0.8');
      pat.appendChild(l);
    };
    const addCircle = (cx,cy,r) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r);
      c.setAttribute('fill', stroke); c.setAttribute('opacity','0.8');
      pat.appendChild(c);
    };

    switch(type) {
      case 'hlines':
        addLine(0,2.5,size,2.5); addLine(0,7.5,size,7.5); break;
      case 'vlines':
        addLine(2.5,0,2.5,size); addLine(7.5,0,7.5,size); break;
      case 'crosshatch':
        addLine(0,2.5,size,2.5); addLine(0,7.5,size,7.5);
        addLine(2.5,0,2.5,size); addLine(7.5,0,7.5,size); break;
      case 'diag':
        // Diagonal con tiles que se encadenan sin corte
        addLine(-2,size+2,size+2,-2);
        addLine(-2+size,size+2,size+2+size,-2); break;
      case 'diag_inv':
        addLine(-2,-2,size+2,size+2);
        addLine(-2-size,-2,size+2-size,size+2); break;
      case 'dots':
        addCircle(2.5,2.5,1.2); addCircle(7.5,2.5,1.2);
        addCircle(2.5,7.5,1.2); addCircle(7.5,7.5,1.2);
        addCircle(5,5,1.2); break;
    }

    defs.appendChild(pat);
    return id;
  }

  // Aplicar patrón a todos los paths de una capa geoJSON
  function applyPatternToLayer(geoLayer, type, color, opacity) {
    if (!geoLayer) return;
    // Necesitamos esperar a que Leaflet haya añadido los elementos al SVG
    setTimeout(() => {
      const patId = ensurePattern(type, color);
      geoLayer.eachLayer(layer => {
        const el = layer.getElement ? layer.getElement() : null;
        if (!el) return;
        if (patId) {
          el.setAttribute('fill', `url(#${patId})`);
          el.setAttribute('fill-opacity', '1');
        } else {
          el.setAttribute('fill', color);
          el.setAttribute('fill-opacity', String(opacity));
        }
      });
    }, 50);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const FOUR=['#E63946','#457B9D','#2D9E6B','#E9C46A'];
  function getFourMap(feats){
    const adj={},map={};
    for(let i=0;i<feats.length;i++) adj[i]=[];
    for(let i=0;i<feats.length;i++){
      const b1=bbF(feats[i]); if(!b1) continue;
      for(let j=i+1;j<feats.length;j++){
        const b2=bbF(feats[j]); if(!b2) continue;
        if(b1.x2>=b2.x1&&b2.x2>=b1.x1&&b1.y2>=b2.y1&&b2.y2>=b1.y1){adj[i].push(j);adj[j].push(i);}
      }
    }
    for(let i=0;i<feats.length;i++){
      const used=new Set((adj[i]||[]).map(j=>map[j]).filter(Boolean));
      map[i]=FOUR.find(c=>!used.has(c))||FOUR[0];
    }
    return map;
  }
  function bbF(f){
    const g=f.geometry; if(!g) return null;
    const r=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    const c=r.flat(); if(!c.length) return null;
    return{x1:Math.min(...c.map(v=>v[0])),x2:Math.max(...c.map(v=>v[0])),
           y1:Math.min(...c.map(v=>v[1])),y2:Math.max(...c.map(v=>v[1]))};
  }
  function darken(hex,a){
    if(!hex||hex.length<7) return '#000';
    return '#'+[1,3,5].map(i=>Math.max(0,parseInt(hex.slice(i,i+2),16)-a).toString(16).padStart(2,'0')).join('');
  }
  function fmtNum(n){return n?Number(n).toLocaleString('es-AR'):'—';}
  function ttRow(k,v){return `<div class="tt-row"><span>${k}</span><span>${v}</span></div>`;}

  function tooltipHTML(props,layerName){
    const name=props.nombre||'—', label=LAYER_LABELS[layerName]||layerName;
    let h=`<div class="tt-title">${name}</div><div class="tt-sub">${label}</div>`;
    if(layerName==='provincias'){
      if(props.capital)        h+=ttRow('Capital',    props.capital);
      if(props.region)         h+=ttRow('Región',     props.region);
      if(props.poblacion)      h+=ttRow('Población',  fmtNum(props.poblacion)+' hab.');
      if(props.superficie_km2) h+=ttRow('Superficie', fmtNum(props.superficie_km2)+' km²');
      if(props.iso_id)         h+=ttRow('ISO',        props.iso_id);
    } else if(layerName==='municipios'){
      if(props.categoria) h+=ttRow('Tipo',      props.categoria);
      if(props.provincia) h+=ttRow('Provincia', props.provincia);
      const locs=locIndex[props.id];
      if(locs&&locs.length){
        const top=locs.slice(0,5).join(', ')+(locs.length>5?` y ${locs.length-5} más`:'');
        h+=ttRow('Localidades',top);
      }
    } else if(layerName==='barrios'){
      if(props.comuna)  h+=ttRow('Comuna','N° '+props.comuna);
      if(props.area_m2) h+=ttRow('Área',(props.area_m2/1e6).toFixed(2)+' km²');
    } else if(layerName==='regiones'){
      if(props.descripcion) h+=ttRow('Descripción',props.descripcion);
      if(props.provincias)  h+=ttRow('Provincias', props.provincias);
    } else {
      // Hidrografía: ríos, lagos, canales, diques
      if(props.tipo)   h+=ttRow('Tipo',   props.tipo);
      if(props.objeto) h+=ttRow('Objeto', props.objeto);
    }
    return h;
  }

  // ── Fetch + cache ─────────────────────────────────────────────────────────────
  async function fetchGeo(url){
    if(GEO_CACHE[url]) return GEO_CACHE[url];
    const res=await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    GEO_CACHE[url]=await res.json(); return GEO_CACHE[url];
  }
  const extURL=p=>chrome.runtime.getURL(p);

  // ── Crear capa Leaflet ────────────────────────────────────────────────────────
  function makeLayer(geo, layerName, colorOvr) {
    const ls = LS[layerName] || {color: colorOvr||'#3399FF', opacity:0.4, pat:'solid'};
    const cmap = useFourColors ? getFourMap(geo.features) : null;
    const patType = ls.pat || 'solid';

    // Detectar geometría predominante para manejo de líneas y puntos
    const firstType = geo.features[0]?.geometry?.type || 'Polygon';
    const isLine  = firstType.includes('LineString');
    const isPoint = firstType === 'Point';

    const geoLayer = L.geoJSON(geo, {
      pointToLayer: isPoint ? (feat, latlng) => {
        const idx = geo.features.indexOf(feat);
        const fill = cmap ? (cmap[idx]||ls.color) : (colorOvr||ls.color);
        return L.circleMarker(latlng, {
          radius:6, fillColor:fill, color:'#fff',
          weight:1.5, opacity:1, fillOpacity:ls.opacity
        });
      } : undefined,
      style: (feat) => {
        const idx = geo.features.indexOf(feat);
        const fill = cmap ? (cmap[idx]||ls.color) : (colorOvr||ls.color);
        if (isLine) {
          return { color:fill, weight:2, opacity:ls.opacity, fill:false };
        }
        return {
          fillColor:   fill,
          fillOpacity: patType === 'solid' ? ls.opacity : 0,
          color:       darken(fill, 45),
          weight:      1.5,
          opacity:     Math.min(ls.opacity * 2.2, 0.88)
        };
      },
      onEachFeature: (feat, layer) => {
        if (!feat.properties) return;
        layer.bindTooltip(
          `<div class="mc-tt">${tooltipHTML(feat.properties, layerName)}</div>`,
          {sticky:true, opacity:1, className:'mc-tt-wrap'}
        );
        layer.on('mouseover', function(){
          // Solo cambiar el borde — NO tocar fill para no borrar el patrón SVG
          const el = this.getElement();
          if (el) {
            el.style.strokeWidth = '2.5px';
            el.style.strokeOpacity = '1';
          }
          this.bringToFront();
        });
        layer.on('mouseout', function(){
          const el = this.getElement();
          if (el) {
            el.style.strokeWidth = '1.5px';
            el.style.strokeOpacity = String(Math.min(ls.opacity * 2.2, 0.88));
          }
        });
      }
    });

    // Después de añadir al mapa, aplicar patrones SVG
    geoLayer.on('add', function() {
      if (patType !== 'solid') {
        const color = colorOvr || ls.color;
        applyPatternToLayer(this, patType, color, ls.opacity);
      }
    });

    return geoLayer;
  }

  async function loadLayer(name) {
    if (LS[name].lyr) { map.removeLayer(LS[name].lyr); LS[name].lyr = null; }
    if (!LS[name].active) return;
    if (!LS[name].geo) {
      try { LS[name].geo = await fetchGeo(extURL(`assets/geo/${GEO_FILES[name]}`)); }
      catch(e) { console.error('[OSM]', name, e.message); return; }
    }
    LS[name].lyr = makeLayer(LS[name].geo, name).addTo(map);
  }

  async function loadProvLayer(slug) {
    if (provLyr) { map.removeLayer(provLyr); provLyr = null; }
    if (!slug) return;
    try {
      const geo = await fetchGeo(extURL(`assets/geo/municipios/muni_${slug}.geojson`));
      provLyr = makeLayer(geo, 'municipios').addTo(map);
    } catch(e) { console.error('[OSM] prov', slug, e.message); }
  }

  async function reloadAll() {
    for (const n of ['regiones','provincias','municipios','barrios']) {
      if (LS[n].lyr) { map.removeLayer(LS[n].lyr); LS[n].lyr = null; }
      if (LS[n].active) await loadLayer(n);
    }
    if (activeProv) {
      if (provLyr) { map.removeLayer(provLyr); provLyr = null; }
      await loadProvLayer(activeProv);
    }
    // Reinvalidar defs al recargar (el SVG se recrea)
    svgDefs = null;
  }

  // ── Localidades ───────────────────────────────────────────────────────────────
  function showLocalities(locs) {
    locLayerGroup.clearLayers();
    if (!locs || !locs.length) return;
    locs.forEach(l => {
      const marker = L.circleMarker([l.y, l.x], {
        radius: 5, fillColor: '#CC0000', color: '#fff',
        weight: 1.5, opacity: 1, fillOpacity: 0.9
      });
      marker.bindTooltip(
        `<div class="mc-tt"><div class="tt-title">${l.n}</div><div class="tt-sub">Localidad</div></div>`,
        {sticky:true, opacity:1, className:'mc-tt-wrap'}
      );
      locLayerGroup.addLayer(marker);
    });
    // Zoom automático al conjunto de localidades
    const bounds = L.latLngBounds(locs.map(l => [l.y, l.x]));
    map.fitBounds(bounds, {padding:[40,40], maxZoom:11});
  }

  // ── GeoVisor ──────────────────────────────────────────────────────────────────
  function openGeoVisor(provSlug) {
    // Siempre pasar la posición y zoom actuales del mapa OSM
    const center = map.getCenter();
    const zoom   = map.getZoom();
    const lat    = center.lat.toFixed(5);
    const lon    = center.lng.toFixed(5);
    // GeoPortal IGN acepta: ?zoom=N&lat=X&lon=Y
    const url = `https://mapa.ign.gob.ar/?zoom=${zoom}&lat=${lat}&lon=${lon}`;
    window.open(url, '_blank');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    try { locIndex = await fetchGeo(extURL('assets/geo/loc_by_dept.json')); } catch(e) {}
    try { locHierarchy = await fetchGeo(extURL('assets/geo/localidades_idx.json')); } catch(e) {}
    for (const n of ['regiones','provincias','municipios','barrios'])
      if (LS[n].active) await loadLayer(n);
    populateLocProvSelect();
    populateMuniProvSelect();
  }
  init();

  function populateLocProvSelect() {
    const sel = document.getElementById('loc-prov-sel'); if (!sel) return;
    Object.entries(MUNI_BY_PROV).sort((a,b) => a[1].localeCompare(b[1])).forEach(([slug,label]) => {
      const opt = document.createElement('option'); opt.value = slug; opt.textContent = label; sel.appendChild(opt);
    });
  }

  function populateMuniProvSelect() {
    const sel = document.getElementById('prov-sel'); if (!sel) return;
    Object.entries(MUNI_BY_PROV).forEach(([slug,label]) => {
      const opt = document.createElement('option'); opt.value = slug; opt.textContent = label; sel.appendChild(opt);
    });
  }

  // ── UI Events ─────────────────────────────────────────────────────────────────

  // Toggles capas
  document.querySelectorAll('input[type=checkbox][data-layer]').forEach(tog => {
    tog.addEventListener('change', async () => {
      const n = tog.dataset.layer; if(!LS[n]) return;
      LS[n].active = tog.checked;
      const opEl = document.getElementById(`oprow-${n}`);
      const patEl = document.getElementById(`patrow-${n}`);
      if(opEl)  opEl.style.display  = tog.checked ? '' : 'none';
      if(patEl) patEl.style.display = tog.checked ? '' : 'none';
      if (n === 'municipios') {
        document.getElementById('prov-sel-wrap').style.display = tog.checked ? '' : 'none';
        if (!tog.checked && provLyr) {
          map.removeLayer(provLyr); provLyr = null; activeProv = null;
          document.getElementById('prov-sel').value = '';
        }
      }
      await loadLayer(n);
    });
  });

  // Sliders opacidad
  document.querySelectorAll('input[type=range][data-layer]').forEach(sl => {
    sl.addEventListener('input', () => {
      const n = sl.dataset.layer, val = parseInt(sl.value) / 100;
      LS[n].opacity = val;
      document.getElementById(`opv-${n}`).textContent = sl.value + '%';
      const applyOp = lyr => {
        if (!lyr) return;
        if (LS[n].pat === 'solid') lyr.setStyle({fillOpacity: val});
        // Para patrones el fill-opacity se maneja via SVG, solo actualizamos el borde
        lyr.setStyle({opacity: Math.min(val * 2.2, 0.88)});
      };
      applyOp(LS[n].lyr);
      if (n === 'municipios') applyOp(provLyr);
    });
  });

  // Selectores de patrón
  document.querySelectorAll('select.pat-sel[data-layer]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const n = sel.dataset.layer;
      LS[n].pat = sel.value;
      // Recargar capa con nuevo patrón
      if (LS[n].lyr) { map.removeLayer(LS[n].lyr); LS[n].lyr = null; }
      if (LS[n].active) await loadLayer(n);
      if (n === 'municipios' && activeProv) {
        if (provLyr) { map.removeLayer(provLyr); provLyr = null; }
        await loadProvLayer(activeProv);
      }
    });
  });

  // Swatches color
  document.querySelectorAll('.osm-swatch[data-layer]').forEach(sw => {
    sw.addEventListener('click', () => {
      const n = sw.dataset.layer;
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = LS[n].color;
      inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(inp); inp.click();
      inp.addEventListener('input', async e => {
        LS[n].color = e.target.value; sw.style.background = e.target.value;
        // Recargar con nuevo color
        if (LS[n].lyr) { map.removeLayer(LS[n].lyr); LS[n].lyr = null; }
        if (LS[n].active) await loadLayer(n);
        if (n === 'municipios' && activeProv) {
          if (provLyr) { map.removeLayer(provLyr); provLyr = null; }
          await loadProvLayer(activeProv);
        }
      });
      inp.addEventListener('change', () => inp.remove());
    });
  });

  // Selector provincia para municipios
  document.getElementById('prov-sel').addEventListener('change', async () => {
    const slug = document.getElementById('prov-sel').value;
    activeProv = slug || null;
    if (slug) {
      LS.municipios.active = false;
      document.getElementById('tog-municipios').checked = false;
      if (LS.municipios.lyr) { map.removeLayer(LS.municipios.lyr); LS.municipios.lyr = null; }
    } else {
      if (document.getElementById('tog-municipios').checked) await loadLayer('municipios');
    }
    await loadProvLayer(slug);
    // Actualizar botón GeoVisor
    updateGeoVisorBtn(slug);
  });

  // Selector provincia localidades
  document.getElementById('loc-prov-sel').addEventListener('change', () => {
    const slug = document.getElementById('loc-prov-sel').value;
    const deptSel = document.getElementById('loc-dept-sel');
    const locInfo = document.getElementById('loc-info');
    deptSel.innerHTML = '<option value="">— Seleccioná departamento —</option>';
    deptSel.style.display = 'none'; locInfo.style.display = 'none';
    locLayerGroup.clearLayers();
    if (!slug) return;
    const provData = locHierarchy[slug]; if (!provData) return;
    Object.entries(provData.depts)
      .sort((a,b) => a[1].nombre.localeCompare(b[1].nombre))
      .forEach(([did, ddata]) => {
        const opt = document.createElement('option'); opt.value = did;
        opt.textContent = `${ddata.nombre} (${ddata.locs.length})`; deptSel.appendChild(opt);
      });
    deptSel.style.display = '';
  });

  // Selector departamento localidades
  document.getElementById('loc-dept-sel').addEventListener('change', () => {
    const slug = document.getElementById('loc-prov-sel').value;
    const deptId = document.getElementById('loc-dept-sel').value;
    const locInfo = document.getElementById('loc-info');
    locLayerGroup.clearLayers(); locInfo.style.display = 'none';
    if (!slug || !deptId) return;
    const ddata = locHierarchy[slug]?.depts?.[deptId]; if (!ddata) return;
    showLocalities(ddata.locs);
    locInfo.textContent = `📍 ${ddata.locs.length} localidades en ${ddata.nombre}`;
    locInfo.style.display = '';
  });

  // 4 colores
  document.getElementById('tog-fourcolors').addEventListener('change', async e => {
    useFourColors = e.target.checked; svgDefs = null; await reloadAll();
  });

  // Colapsar panel
  document.getElementById('osm-collapse-btn').addEventListener('click', e => {
    const b = document.getElementById('osm-body'), hide = b.style.display !== 'none';
    b.style.display = hide ? 'none' : ''; e.target.textContent = hide ? '+' : '−';
  });

  // Reset vista
  document.getElementById('btn-reset-view').addEventListener('click', () => {
    map.flyTo([-38.0,-63.0], 5, {animate:true, duration:1});
  });

  // GeoVisor
  document.getElementById('btn-geovisor').addEventListener('click', () => {
    const slug = document.getElementById('prov-sel').value || activeProv;
    openGeoVisor(slug);
  });

  function updateGeoVisorBtn(slug) {
    const btn = document.getElementById('btn-geovisor');
    if (!btn) return;
    const label = slug && MUNI_BY_PROV[slug] ? `GeoVisor — ${MUNI_BY_PROV[slug]} ↗` : 'Ver en GeoVisor IGN ↗';
    btn.textContent = label;
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const panel=document.getElementById('osm-panel'), header=document.getElementById('osm-header');
  let drag=false,sx,sy,sl,st;
  header.addEventListener('mousedown', e => {
    if (e.target.closest('.osm-icon-btn')) return;
    drag=true; const r=panel.getBoundingClientRect();
    sx=e.clientX;sy=e.clientY;sl=r.left;st=r.top; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    panel.style.left=(sl+e.clientX-sx)+'px'; panel.style.top=(st+e.clientY-sy)+'px'; panel.style.right='auto';
  });
  document.addEventListener('mouseup', () => { drag=false; });

})();
