// GEO PORTAL DE MOVILIDAD
// Leaflet + archivos GeoJSON locales + Chart.js
// Ejecutar con Live Server. Los datos incluidos son sintéticos.

const mapa = L.map("mapa", { preferCanvas: true }).setView([19.416, -99.158], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);

const estado = document.getElementById("estado");
const seleccionActual = document.getElementById("seleccionActual");
const filtroZona = document.getElementById("filtroZona");
const filtroTipo = document.getElementById("filtroTipo");
const filtroPeriodo = document.getElementById("filtroPeriodo");

const urls = {
  rutas: "rutas.geojson",
  paradas: "paradas.geojson",
  zonas: "zonas.geojson",
  red: "red_vial.geojson",
  deseo: "lineas_deseo.geojson",
  od: "matriz_od.geojson"
};

const datos = {};
const capas = {};
let seleccion = null;
let chartBarras = null;
let chartTiempo = null;

const fmt = n => Number(n || 0).toLocaleString("es-MX");
const num = n => Number.isFinite(Number(n)) ? Number(n) : 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function popupHtml(props, titulo) {
  const filas = Object.entries(props || {})
    .filter(([k]) => !["coords", "geometry"].includes(k))
    .map(([k, v]) => `<div><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</div>`)
    .join("");
  return `<div><b>${escapeHtml(titulo)}</b>${filas}</div>`;
}

async function cargarGeoJSON(nombre, url, opciones = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    throw new Error(`${url} no contiene un FeatureCollection GeoJSON válido.`);
  }
  datos[nombre] = json;
  capas[nombre] = L.geoJSON(json, opciones);
  return json;
}

function agregarEventosSeleccion(capa, feature, tipo) {
  const p = feature.properties || {};
  capa.on("click", () => {
    seleccion = { tipo, id: String(p.id ?? p.nombre ?? "") };
    seleccionActual.textContent = `Selección: ${p.nombre || p.id || tipo}`;
    sincronizar();
    capa.openPopup?.();
  });
}

function estiloZona(feature) {
  const p = feature.properties || {};
  const activa = filtroZona.value === "TODAS" || p.id === filtroZona.value;
  const elegida = seleccion?.tipo === "zonas" && seleccion.id === String(p.id);
  return {
    color: elegida ? "#b85e0f" : "#118a29",
    weight: elegida ? 3 : 1,
    fillColor: elegida ? "#f3b65c" : "#ead9a5",
    fillOpacity: activa ? 0.28 : 0.06
  };
}

function crearCapas() {
  capas.zonas = L.geoJSON(datos.zonas, {
    style: estiloZona,
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Zona"));
      agregarEventosSeleccion(layer, f, "zonas");
    }
  });

  capas.red = L.geoJSON(datos.red, {
    style: f => ({
      color: f.properties?.tipo === "Arterial" ? "#8c9aa7" : "#b7c0c8",
      weight: f.properties?.tipo === "Arterial" ? 3 : 1.5,
      opacity: 0.8
    }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Red vial"));
      agregarEventosSeleccion(layer, f, "red");
    }
  });

  capas.rutas = L.geoJSON(datos.rutas, {
    style: f => ({
      color: seleccion?.tipo === "rutas" && seleccion.id === String(f.properties?.id) ? "#f28c28" : "#1976a8",
      weight: seleccion?.tipo === "rutas" && seleccion.id === String(f.properties?.id) ? 7 : 4,
      opacity: 0.95
    }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Ruta"));
      agregarEventosSeleccion(layer, f, "rutas");
    }
  });

  capas.paradas = L.geoJSON(datos.paradas, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: seleccion?.tipo === "paradas" && seleccion.id === String(f.properties?.id) ? 9 : 6,
      color: "#ffffff", weight: 2, fillColor: "#248b62", fillOpacity: 1
    }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Parada"));
      agregarEventosSeleccion(layer, f, "paradas");
    }
  });

  capas.deseo = L.geoJSON(datos.deseo, {
    style: f => ({
      color: seleccion?.tipo === "deseo" && seleccion.id === String(f.properties?.id) ? "#ff9f43" : "#d85c78",
      weight: Math.max(2, Math.min(8, 1.5 + num(f.properties?.viajes) / 150)),
      opacity: 0.8,
      dashArray: "5 4"
    }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Línea de deseo"));
      agregarEventosSeleccion(layer, f, "deseo");
    }
  });

  capas.od = L.geoJSON(datos.od, {
    style: f => ({
      color: seleccion?.tipo === "od" && seleccion.id === String(f.properties?.id) ? "#ff9f43" : "#8059bd",
      weight: seleccion?.tipo === "od" && seleccion.id === String(f.properties?.id) ? 6 : 3,
      opacity: 0.75
    }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(popupHtml(f.properties, "Conexión origen-destino"));
      agregarEventosSeleccion(layer, f, "od");
    }
  });
}

function configurarControlesCapas() {
  document.querySelectorAll("[data-layer]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.layer;
      if (!capas[key]) return;
      if (input.checked) capas[key].addTo(mapa);
      else mapa.removeLayer(capas[key]);
    });
  });
}

function poblarFiltroZonas() {
  datos.zonas.features.forEach(f => {
    const p = f.properties || {};
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${p.id} · ${p.nombre}`;
    filtroZona.appendChild(option);
  });
}

function registrosFiltrados(nombre) {
  const features = datos[nombre]?.features || [];
  const zona = filtroZona.value;
  const tipo = filtroTipo.value;
  return features.filter(f => {
    const p = f.properties || {};
    const zonaRegistro = p.zona || p.origen || "";
    const coincideZona = zona === "TODAS" || zonaRegistro === zona ||
      (p.destino === zona);
    const coincideTipo =
      tipo === "TODOS" ||
      (tipo === "RUTAS" && nombre === "rutas") ||
      (tipo === "PARADAS" && nombre === "paradas") ||
      (tipo === "DEMANDA" && ["deseo", "od"].includes(nombre));
    return coincideZona && coincideTipo;
  });
}

function featuresParaGraficos() {
  // Si hay una selección de una ruta/parada/OD, mostrar esa selección;
  // en caso contrario, respetar los filtros globales.
  if (seleccion) {
    const origen = datos[seleccion.tipo]?.features || [];
    const feature = origen.find(f => String(f.properties?.id ?? f.properties?.nombre) === seleccion.id);
    if (feature) {
      if (seleccion.tipo === "rutas") return [feature];
      if (seleccion.tipo === "deseo" || seleccion.tipo === "od") return [feature];
      if (seleccion.tipo === "paradas") return [feature];
      if (seleccion.tipo === "zonas") {
        return (datos.rutas.features || []).filter(f => f.properties?.zona === seleccion.id);
      }
    }
  }
  const rutas = registrosFiltrados("rutas");
  return rutas;
}

function actualizarKPI() {
  const rutas = registrosFiltrados("rutas");
  const paradas = registrosFiltrados("paradas");
  const deseo = registrosFiltrados("deseo");
  const od = registrosFiltrados("od");

  const viajesRutas = rutas.reduce((s, f) => s + num(f.properties?.viajes), 0);
  const viajesOD = od.reduce((s, f) => s + num(f.properties?.viajes), 0);
  const pasajeros = rutas.reduce((s, f) => s + num(f.properties?.pasajeros), 0)
    + paradas.reduce((s, f) => s + num(f.properties?.pasajeros_dia), 0);

  document.getElementById("kpiRutas").textContent = fmt(rutas.length);
  document.getElementById("kpiParadas").textContent = fmt(paradas.length);
  document.getElementById("kpiViajes").textContent = fmt(viajesRutas + viajesOD);
  document.getElementById("kpiPasajeros").textContent = fmt(pasajeros);
}

function actualizarBarras() {
  const features = featuresParaGraficos();
  const labels = features.map(f => f.properties?.nombre || f.properties?.id || "Registro");
  const values = features.map(f => num(f.properties?.viajes));
  chartBarras.data.labels = labels;
  chartBarras.data.datasets[0].data = values;
  chartBarras.data.datasets[0].label = seleccion ? "Viajes del elemento seleccionado" : "Viajes por ruta";
  chartBarras.update();
}

function actualizarTiempo() {
  const periodo = filtroPeriodo.value;
  const serie = window.SERIE_TIEMPO;
  const seriesElegidas = periodo === "TODOS"
    ? ["AM", "MD", "PM", "EV"]
    : [periodo];

  chartTiempo.data.datasets = seriesElegidas.map((key, i) => ({
    label: ({ AM: "Punta mañana", MD: "Mediodía", PM: "Punta tarde", EV: "Noche" })[key],
    data: serie[key],
    borderWidth: 2,
    tension: 0.25,
    fill: false
  }));
  chartTiempo.data.labels = serie.labels;
  chartTiempo.update();
}

function actualizarTablaOD() {
  const tbody = document.getElementById("tablaOD");
  tbody.replaceChildren();
  registrosFiltrados("od").forEach(f => {
    const p = f.properties || {};
    const tr = document.createElement("tr");
    [p.origen, p.destino, fmt(p.viajes)].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value ?? "—";
      tr.appendChild(td);
    });
    tr.title = "Seleccionar conexión en el mapa";
    tr.addEventListener("click", () => {
      seleccion = { tipo: "od", id: String(p.id) };
      seleccionActual.textContent = `Selección: ${p.origen} → ${p.destino}`;
      const layer = capas.od.getLayers().find(l => String(l.feature?.properties?.id) === String(p.id));
      if (layer) {
        if (!mapa.hasLayer(capas.od)) capas.od.addTo(mapa);
        mapa.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });
        layer.openPopup();
      }
      sincronizar();
    });
    tbody.appendChild(tr);
  });
}


function sincronizar() {
  // 1. Retirar las capas actuales del mapa para actualizarlas
  Object.values(capas).forEach(capa => {
    if (capa && mapa.hasLayer(capa)) {
      mapa.removeLayer(capa);
    }
  });

  // 2. Recrear las capas con los estilos y la selección actual
  crearCapas();

  // 3. Volver a agregar únicamente las capas activadas
  document.querySelectorAll("[data-layer]").forEach(input => {
    const key = input.dataset.layer;

    if (input.checked && capas[key]) {
      capas[key].addTo(mapa);
    }
  });

  // 4. Actualizar indicadores, gráficos y tabla
  actualizarKPI();
  actualizarBarras();
  actualizarTiempo();
  actualizarTablaOD();

  // 5. Actualizar la ficha técnica de la ruta
  actualizarFichaRuta();

  // 6. Sincronizar el selector con la ruta seleccionada
  if (seleccion?.tipo === "rutas") {
    selectorRuta.value = seleccion.id;
  } else {
    selectorRuta.value = "";
  }

  // 7. Mostrar el estado del geoportal
  estado.textContent = "Geoportal listo · filtros aplicados";
}

function crearGraficos() {
  chartBarras = new Chart(document.getElementById("graficoBarras"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Viajes por ruta", data: [], backgroundColor: "#1976a8", borderRadius: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  chartTiempo = new Chart(document.getElementById("graficoTiempo"), {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

async function iniciar() {
  try {
    estado.textContent = "Cargando archivos GeoJSON…";
    await Promise.all([
      cargarGeoJSON("rutas", urls.rutas),
      cargarGeoJSON("paradas", urls.paradas),
      cargarGeoJSON("zonas", urls.zonas),
      cargarGeoJSON("red", urls.red),
      cargarGeoJSON("deseo", urls.deseo),
      cargarGeoJSON("od", urls.od)
    ]);

    poblarFiltroZonas();
    poblarSelectorRutas();
    crearCapas();
    crearGraficos();
    configurarControlesCapas();

    Object.keys(capas).forEach(key => {
      const checkbox = document.querySelector(`[data-layer="${key}"]`);
      if (!checkbox || checkbox.checked) capas[key].addTo(mapa);
    });

    const todas = L.featureGroup(Object.values(capas));
    if (todas.getBounds().isValid()) mapa.fitBounds(todas.getBounds(), { padding: [18, 18] });

    [filtroZona, filtroTipo, filtroPeriodo].forEach(el => {
      el.addEventListener("change", () => {
        seleccion = null;
        seleccionActual.textContent = "Selección: ninguna";
        sincronizar();
      });
    });

    document.getElementById("btnExtender").addEventListener("click", () => {
      Object.values(capas).forEach(capa => {
        if (!mapa.hasLayer(capa)) capa.addTo(mapa);
      });
      document.querySelectorAll("[data-layer]").forEach(el => el.checked = true);
      const todasCapas = L.featureGroup(Object.values(capas));
      if (todasCapas.getBounds().isValid()) mapa.fitBounds(todasCapas.getBounds(), { padding: [20, 20] });
      sincronizar();
    });

    sincronizar();
  } catch (error) {
    console.error(error);
    estado.textContent = `Error al cargar datos: ${error.message}. Verifica que uses Live Server y que existan los archivos de data/.`;
  }
}



/* =========================================
   SELECTOR Y FICHA TÉCNICA DE RUTAS
========================================= */

const buscarRuta = document.getElementById("buscarRuta");
const selectorRuta = document.getElementById("selectorRuta");

// Crear lista de rutas desde el GeoJSON
function poblarSelectorRutas() {
  actualizarOpcionesRutas("");
}

// Filtrar la lista mientras escribes
function actualizarOpcionesRutas(texto) {
  const termino = texto.trim().toLocaleLowerCase("es-MX");
  const valorActual =
    seleccion?.tipo === "rutas" ? seleccion.id : "";

  selectorRuta.replaceChildren();

  const opcionInicial = document.createElement("option");
  opcionInicial.value = "";
  opcionInicial.textContent = "Selecciona una ruta...";
  selectorRuta.appendChild(opcionInicial);

  (datos.rutas?.features || []).forEach(feature => {
    const p = feature.properties || {};
    const id = String(p.id ?? p.nombre ?? "");
    const nombre = String(p.nombre ?? id);

    if (
      nombre.toLocaleLowerCase("es-MX").includes(termino) ||
      id.toLocaleLowerCase("es-MX").includes(termino)
    ) {
      const opcion = document.createElement("option");
      opcion.value = id;
      opcion.textContent = `${id} — ${nombre}`;
      selectorRuta.appendChild(opcion);
    }
  });

  // Mantener seleccionada la ruta si sigue en los resultados
  selectorRuta.value = valorActual;

  if (valorActual && selectorRuta.value !== valorActual) {
    selectorRuta.value = "";
  }
}

// Mostrar un atributo o indicar que no existe
function valorRuta(valor, sufijo = "") {
  if (valor === undefined || valor === null || valor === "") {
    return "No disponible";
  }

  if (typeof valor === "number") {
    return `${valor.toLocaleString("es-MX")}${sufijo}`;
  }

  return `${valor}${sufijo}`;
}

// Actualizar la ficha técnica
function actualizarFichaRuta() {
  const ruta = (datos.rutas?.features || []).find(feature => {
    const p = feature.properties || {};
    return seleccion?.tipo === "rutas" &&
      String(p.id ?? p.nombre ?? "") === seleccion.id;
  });

  const campos = {
    rutaSubtitulo: ruta
      ? ruta.properties.nombre ?? ruta.properties.id
      : "Selecciona una ruta para consultar sus datos.",
    rutaId: ruta ? ruta.properties.id : null,
    rutaLongitud: ruta
      ? valorRuta(ruta.properties.longitud_km, " km") : null,
    rutaTipo: ruta
      ? ruta.properties.tipo_servicio : null,
    rutaEstado: ruta
      ? ruta.properties.estado_operativo : null,
    rutaFrecuencia: ruta
      ? valorRuta(ruta.properties.frecuencia_min, " min") : null,
    rutaFlota: ruta
      ? ruta.properties.flota_asignada : null,
    rutaViajes: ruta
      ? ruta.properties.viajes : null,
    rutaPasajeros: ruta
      ? ruta.properties.pasajeros : null,
    rutaOrigen: ruta
      ? ruta.properties.terminal_origen : null,
    rutaDestino: ruta
      ? ruta.properties.terminal_destino : null
  };

  Object.entries(campos).forEach(([id, valor]) => {
    document.getElementById(id).textContent =
      valor === null || valor === undefined || valor === ""
        ? (id === "rutaSubtitulo"
            ? "Selecciona una ruta para consultar sus datos."
            : "No disponible")
        : valor;
  });
}

// Seleccionar una ruta desde la lista
selectorRuta.addEventListener("change", () => {
  const id = selectorRuta.value;

  if (!id) {
    seleccion = null;
    seleccionActual.textContent = "Selección: ninguna";
    sincronizar();
    return;
  }

  const feature = datos.rutas.features.find(f =>
    String(f.properties?.id ?? f.properties?.nombre ?? "") === id
  );

  if (!feature) return;

  seleccion = { tipo: "rutas", id };
  seleccionActual.textContent =
    `Selección: ${feature.properties.nombre ?? id}`;

  sincronizar();

  // Centrar el mapa en la ruta seleccionada
  const capa = capas.rutas.getLayers().find(layer =>
    String(layer.feature?.properties?.id ??
      layer.feature?.properties?.nombre ?? "") === id
  );

  if (capa && mapa.hasLayer(capas.rutas)) {
    mapa.fitBounds(capa.getBounds(), {
      padding: [30, 30],
      maxZoom: 15
    });
    capa.openPopup();
  }
});

// Buscar por nombre o identificador
buscarRuta.addEventListener("input", () => {
  actualizarOpcionesRutas(buscarRuta.value);
});

// Limpiar la selección y el buscador
document.getElementById("limpiarRuta").addEventListener("click", () => {
  buscarRuta.value = "";
  seleccion = null;
  seleccionActual.textContent = "Selección: ninguna";
  actualizarOpcionesRutas("");
  sincronizar();
});




iniciar();
