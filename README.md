# 🗺 Map Colorer Argentina

> Extensión educativa para Google Chrome que superpone capas geográficas interactivas sobre Google Maps y OpenStreetMap, con datos oficiales del Instituto Geográfico Nacional (IGN) de Argentina.

![Version](https://img.shields.io/badge/versión-1.5-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue)
![Licencia](https://img.shields.io/badge/licencia-MIT-orange)
![Datos](https://img.shields.io/badge/datos-IGN%20Argentina-lightblue)

---

## ✨ Funcionalidades

### Capas geográficas
| Capa | Fuente | Features |
|------|--------|----------|
| Provincias | IGN | 24 |
| Municipios / Departamentos | IGN | 529 (24 provincias) |
| Barrios CABA | GCBA | 48 |
| Regiones geográficas | IGN | 5 |
| Ríos y corrientes | IGN BH140 | 703 |
| Lagos y embalses | IGN BH130 | 1.118 |
| Lagunas | IGN perenne + intermitente | 4.084 |
| Canales | IGN BH020 | 1.657 |
| Diques | IGN BH051 | 125 |
| Localidades | IGN censal | 4.027 |

### Controles
- 🎨 **Color personalizable** por capa con paleta de colores
- 🔲 **Patrones cartográficos**: sólido, líneas H/V, diagonal, cuadriculado, puntos
- 🔆 **Opacidad ajustable** por capa en tiempo real
- 🎲 **Teorema de los 4 colores** — coloreo automático por adyacencia
- 📍 **Localidades** navegables por provincia → departamento
- 🏔 **Selector de provincia** para municipios on-demand
- 💬 **Tooltips informativos** al pasar el mouse (nombre, capital, población, superficie, localidades)
- 🗺 **Botón GeoVisor IGN** — abre el portal oficial con la posición actual

### Compatibilidad
- ✅ Google Maps (`maps.google.com`) — overlay Canvas sobre el mapa
- ✅ OpenStreetMap — modo propio con Leaflet.js (bundleado, sin CDN)
- ✅ Funciona 100% offline — no hay llamadas a servidores externos
- ✅ Sin recolección de datos — no hay telemetría ni tracking

---

## 🚀 Instalación

### Requisitos
- Google Chrome versión 88 o superior
- No requiere Node.js, Python ni ningún compilador

### Pasos

**1. Clonar o descargar el repositorio**
```bash
git clone https://github.com/luchito12/map-colorer-argentina.git
```
O descargar el ZIP desde el botón verde **Code → Download ZIP**.

**2. Abrir el panel de extensiones en Chrome**
```
chrome://extensions/
```

**3. Activar el Modo Desarrollador**

Activar el switch **"Modo de desarrollador"** en la esquina superior derecha.

**4. Cargar la extensión**

Clic en **"Cargar extensión sin empaquetar"** → seleccionar la carpeta `map-colorer-v2`.

**5. Usar**

Abrí `maps.google.com` — el panel verde aparece automáticamente en la esquina superior derecha.

---

## 📁 Estructura del proyecto

```
map-colorer-v2/
├── manifest.json              # Manifest V3 — configuración de la extensión
├── src/
│   ├── content.js             # Script principal inyectado en Google Maps
│   ├── background.js          # Service worker — persistencia de estado
│   └── overlay.css            # Estilos del panel y tooltips
├── popup/
│   ├── popup.html             # UI del popup de la extensión
│   ├── popup.js               # Lógica del popup
│   ├── osm.html               # Modo OpenStreetMap
│   └── osm.js                 # Lógica del modo OSM
└── assets/
    ├── geo/
    │   ├── provincias.geojson
    │   ├── municipios_arg.geojson
    │   ├── barrios.geojson
    │   ├── regiones.geojson
    │   ├── rios_area.geojson
    │   ├── lagos_embalses.geojson
    │   ├── lagunas.geojson
    │   ├── canales.geojson
    │   ├── diques.geojson
    │   ├── localidades_idx.json   # Índice jerárquico provincia→depto→localidades
    │   ├── loc_by_dept.json       # Índice plano para tooltips
    │   └── municipios/            # GeoJSONs por provincia (24 archivos)
    │       ├── muni_buenos_aires.geojson
    │       ├── muni_cordoba.geojson
    │       └── ...
    └── lib/
        ├── leaflet.js             # Leaflet 1.9.4 (bundleado — sin CDN)
        └── leaflet.css
```

---

## 🔧 Arquitectura técnica

### Google Maps — Canvas Overlay
El modo Google Maps usa un **canvas HTML5 de doble buffer**:
- **Canvas visible** (`z-index: 2147483646`) — renderiza los polígonos coloreados
- **Canvas de hit testing** — canvas oculto donde cada feature se pinta con un color RGB único. Al mover el mouse, `getImageData()` lee el pixel y lo mapea al feature correspondiente. Esto permite tooltips precisos sin depender del DOM de Google Maps.

La proyección usa **Web Mercator** calculada a partir de la URL de Google Maps (`@lat,lng,zoomz` o `@lat,lng,metrosm`).

### OpenStreetMap — Leaflet con SVG patterns
El modo OSM usa Leaflet.js con patrones cartográficos implementados como **SVG `<defs><pattern>`** inyectados directamente en el SVG que genera Leaflet. Esto permite patrones nativos del navegador (rayado, cuadriculado, diagonal) sin perder el renderizado de Leaflet.

### Persistencia de estado
`chrome.storage.local` guarda el estado completo (capas activas, colores, opacidades, patrones) entre sesiones. El service worker actúa como intermediario entre el popup y el content script.

---

## 📊 Fuentes de datos

Todos los datos son de acceso libre y uso público:

| Dataset | Fuente | URL |
|---------|--------|-----|
| Límites administrativos | IGN Argentina | [ign.gob.ar](https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG) |
| Hidrografía | IGN Argentina | [ign.gob.ar](https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG) |
| Localidades censales | IGN / INDEC | [datos.gob.ar](https://datos.gob.ar/dataset/igeo-unidades-geograficas-argentina) |
| Población | INDEC Censo 2022 | [indec.gob.ar](https://www.indec.gob.ar) |
| Mapa base OSM | OpenStreetMap | [openstreetmap.org](https://www.openstreetmap.org) |

---

## 🗺 Recursos relacionados

- **GeoVisor IGN** — visor cartográfico oficial avanzado: [mapa.ign.gob.ar](https://mapa.ign.gob.ar)
- **Portal de datos IGN** — descarga de capas SIG: [ign.gob.ar](https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG)
- **Datos Abiertos Argentina** — datasets georeferenciados: [datos.gob.ar](https://datos.gob.ar)

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Para proponer cambios:

1. Fork del repositorio
2. Crear una rama: `git checkout -b feature/nueva-capa`
3. Commit: `git commit -m 'Agrega capa de ecorregiones'`
4. Push: `git push origin feature/nueva-capa`
5. Abrir un Pull Request

### Ideas para contribuir
- [ ] Capa de ecorregiones de Argentina (18 biomas)
- [ ] Más datos en tooltips (densidad poblacional, PBG provincial)
- [ ] Exportar el mapa actual como imagen PNG
- [ ] Soporte para Firefox (WebExtensions API)
- [ ] Modo daltónico con paletas accesibles

---

## 📄 Licencia

MIT License — libre para usar, modificar y distribuir con atribución.

Los datos geográficos son propiedad del IGN Argentina y se distribuyen bajo
licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

*Desarrollado con ❤️ para la comunidad educativa argentina*
