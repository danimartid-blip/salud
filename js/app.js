// Mi Salud — tablero personal de exámenes. Solo lectura: todo sale de la
// planilla "Salud App - DB" y se pinta acá. Ningún dato vive en el código.

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").trim().toLowerCase();

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Las fechas se guardan como texto "AAAA-MM-DD". Si alguien edita la planilla
 * a mano, Sheets puede convertirla en número de serie: se aceptan las dos. */
function aFecha(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  const m = String(v).trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
}
const fechaLarga = (d) => (d ? `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "sin fecha");
const fechaCorta = (d) => (d ? `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : "");
const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v) => (typeof v === "number" ? v.toLocaleString("es-CL", { maximumFractionDigits: 2 }) : String(v ?? ""));

function hoyUTC() {
  const h = new Date();
  return new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
}
const diasHasta = (d) => Math.round((d - hoyUTC()) / 86400000);

/** Filas con encabezado -> objetos. Las claves quedan en minúscula. */
function aObjetos(filas) {
  if (!filas?.length) return [];
  const cab = filas[0].map((c) => norm(c));
  return filas
    .slice(1)
    .filter((f) => f.some((c) => c !== "" && c != null))
    .map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ""])));
}

// ---------- Estado de cada resultado ----------

const ESTADOS = {
  ok: { cls: "ok", txt: "En rango", icono: "✓" },
  alto: { cls: "atencion", txt: "Alto", icono: "▲" },
  bajo: { cls: "atencion", txt: "Bajo", icono: "▼" },
  atencion: { cls: "atencion", txt: "Atención", icono: "!" },
  alerta: { cls: "alerta", txt: "Alerta", icono: "!" },
  sinref: { cls: "info", txt: "Sin rango", icono: "–" },
  info: { cls: "info", txt: "Informativo", icono: "i" },
};

/** Compara un resultado con SU rango (cada fila guarda el del laboratorio de ese
 * día, porque los rangos cambian entre laboratorios y métodos). */
function estadoDe(r) {
  const v = num(r.valor);
  if (v == null) {
    const t = norm(r.valor);
    if (/^(normal|negativo|no reactivo|ausente)/.test(t)) return "ok";
    if (/(positivo|reactivo|alterad|anormal)/.test(t)) return "atencion";
    return "sinref";
  }
  const min = num(r.ref_min);
  const max = num(r.ref_max);
  if (min == null && max == null) return "sinref";
  if (max != null && v > max) return "alto";
  if (min != null && v < min) return "bajo";
  return "ok";
}

const pill = (estado, texto) => {
  const e = ESTADOS[estado] || ESTADOS.info;
  return `<span class="pill pill-${e.cls}"><span aria-hidden="true">${e.icono}</span> ${esc(texto || e.txt)}</span>`;
};

function rangoTexto(r) {
  const min = num(r.ref_min);
  const max = num(r.ref_max);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (max != null) return `hasta ${fmt(max)}`;
  if (min != null) return `desde ${fmt(min)}`;
  return "sin rango";
}

// ---------- Modelo ----------

let D = null; // datos ya armados

function armar(crudo) {
  const perfil = Object.fromEntries(aObjetos(crudo.Perfil).map((p) => [norm(p.clave), p.valor]));
  const glosario = new Map(aObjetos(crudo.Indicadores).map((g) => [norm(g.analito), g]));

  const porAnalito = new Map();
  for (const r of aObjetos(crudo.Resultados)) {
    if (!r.analito) continue;
    r._fecha = aFecha(r.fecha);
    r._estado = estadoDe(r);
    const k = norm(r.analito);
    if (!porAnalito.has(k)) porAnalito.set(k, []);
    porAnalito.get(k).push(r);
  }

  const indicadores = [];
  for (const [k, serie] of porAnalito) {
    serie.sort((a, b) => (a._fecha || 0) - (b._fecha || 0));
    const ultimo = serie[serie.length - 1];
    const g = glosario.get(k) || {};
    // La skill puede fijar el nivel a mano (ej. "alerta") cuando el contexto
    // clínico pesa más que la comparación con el rango.
    const manual = norm(g.nivel);
    indicadores.push({
      clave: k,
      nombre: ultimo.analito,
      grupo: g.grupo || "Otros",
      orden: num(g.orden) ?? 999,
      glosario: g,
      serie,
      ultimo,
      previo: serie.length > 1 ? serie[serie.length - 2] : null,
      estado: ESTADOS[manual] ? manual : ultimo._estado,
    });
  }
  indicadores.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

  const conFecha = (filas) =>
    aObjetos(filas).map((x) => ({ ...x, _fecha: aFecha(x.fecha) }));

  return {
    perfil,
    indicadores,
    examenes: conFecha(crudo.Examenes).sort((a, b) => (b._fecha || 0) - (a._fecha || 0)),
    diagnosticos: aObjetos(crudo.Diagnosticos),
    medicamentos: aObjetos(crudo.Medicamentos),
    agenda: conFecha(crudo.Agenda),
    preguntas: aObjetos(crudo.Preguntas),
    bitacora: conFecha(crudo.Bitacora).sort((a, b) => (b._fecha || 0) - (a._fecha || 0)),
  };
}

const esAtencion = (i) => ["atencion", "alerta"].includes(ESTADOS[i.estado]?.cls);

// ---------- Piezas visuales ----------

function tendencia(ind) {
  const a = num(ind.ultimo.valor);
  const b = ind.previo ? num(ind.previo.valor) : null;
  if (a == null || b == null) return "";
  const d = a - b;
  if (Math.abs(d) < 1e-9) return `<span class="tend">= igual que ${fechaCorta(ind.previo._fecha)}</span>`;
  const flecha = d > 0 ? "↑" : "↓";
  return `<span class="tend">${flecha} ${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} vs ${fechaCorta(ind.previo._fecha)} (${fmt(b)})</span>`;
}

function sparkline(ind) {
  const pts = ind.serie.map((r) => num(r.valor)).filter((v) => v != null);
  if (pts.length < 2) return `<span class="spark spark-vacio"></span>`;
  const W = 64, H = 26, P = 4;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => (hi === lo ? H / 2 : H - P - ((v - lo) * (H - 2 * P)) / (hi - lo));
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const cls = ESTADOS[ind.estado]?.cls || "info";
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--linea)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts[pts.length - 1]).toFixed(1)}" r="3.5" class="punto-${cls}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

/** Barra que muestra dónde cae el valor respecto del rango de referencia. */
function barraRango(r) {
  const v = num(r.valor), min = num(r.ref_min), max = num(r.ref_max);
  if (v == null || (min == null && max == null)) return "";
  let lo, hi;
  if (min != null && max != null) {
    const span = max - min || Math.abs(max) || 1;
    lo = min - span * 0.6;
    hi = max + span * 0.6;
  } else if (max != null) {
    lo = 0;
    hi = max * 1.6;
  } else {
    lo = min * 0.4;
    hi = min * 2.2;
  }
  lo = Math.min(lo, v);
  hi = Math.max(hi, v);
  const pct = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  const izq = min != null ? pct(min) : 0;
  const der = max != null ? pct(max) : 100;
  const cls = ESTADOS[r._estado]?.cls || "info";
  return `<div class="rango" role="img" aria-label="Valor ${fmt(v)}; rango de referencia ${rangoTexto(r)}">
    <div class="rango-pista">
      <div class="rango-ok" style="left:${izq}%;width:${der - izq}%"></div>
      <div class="rango-marca marca-${cls}" style="left:${pct(v)}%"></div>
    </div>
    <div class="rango-ejes">
      ${min != null ? `<span style="left:${izq}%">${fmt(min)}</span>` : ""}
      ${max != null ? `<span style="left:${der}%">${fmt(max)}</span>` : ""}
    </div>
  </div>`;
}

/** Evolución en el tiempo: una sola serie, con la banda del rango de referencia
 * vigente y cada punto pinchable. */
function grafico(ind) {
  const pts = ind.serie.filter((r) => num(r.valor) != null && r._fecha);
  if (pts.length < 2) return "";
  const W = 340, H = 180, L = 40, R = 16, T = 16, B = 28;
  const min = num(ind.ultimo.ref_min), max = num(ind.ultimo.ref_max);
  const vals = pts.map((r) => num(r.valor));
  let lo = Math.min(...vals, ...(min != null ? [min] : [])), hi = Math.max(...vals, ...(max != null ? [max] : []));
  const margen = (hi - lo || Math.abs(hi) || 1) * 0.15;
  lo -= margen;
  hi += margen;
  const t0 = +pts[0]._fecha, t1 = +pts[pts.length - 1]._fecha;
  const x = (r) => (t1 === t0 ? (L + W - R) / 2 : L + ((+r._fecha - t0) * (W - L - R)) / (t1 - t0));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);

  const yTop = max != null ? y(max) : T;
  const yBot = min != null ? y(min) : H - B;
  const banda =
    min != null || max != null
      ? `<rect x="${L}" y="${yTop.toFixed(1)}" width="${W - L - R}" height="${Math.max(0, yBot - yTop).toFixed(1)}" class="banda"/>
         ${max != null ? `<line x1="${L}" x2="${W - R}" y1="${y(max).toFixed(1)}" y2="${y(max).toFixed(1)}" class="banda-borde"/>` : ""}
         ${min != null ? `<line x1="${L}" x2="${W - R}" y1="${y(min).toFixed(1)}" y2="${y(min).toFixed(1)}" class="banda-borde"/>` : ""}`
      : "";

  const ticks = [lo + margen, (lo + hi) / 2, hi - margen];
  const ejeY = ticks
    .map((v) => `<text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="eje">${fmt(Math.round(v * 100) / 100)}</text>`)
    .join("");
  const linea = pts.map((r, i) => `${i ? "L" : "M"}${x(r).toFixed(1)} ${y(num(r.valor)).toFixed(1)}`).join(" ");
  const puntos = pts
    .map((r, i) => {
      const cls = ESTADOS[r._estado]?.cls || "info";
      const cx = x(r).toFixed(1), cy = y(num(r.valor)).toFixed(1);
      return `<circle cx="${cx}" cy="${cy}" r="5" class="punto-${cls}" stroke="#fff" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="16" fill="transparent" class="punto-toque" tabindex="0" role="button"
          aria-label="${esc(fechaLarga(r._fecha))}: ${esc(fmt(num(r.valor)))} ${esc(r.unidad)}"
          data-tip="${esc(fechaLarga(r._fecha))}|${esc(fmt(num(r.valor)))} ${esc(r.unidad)}|${esc(ESTADOS[r._estado]?.txt || "")}"
          data-x="${((x(r) / W) * 100).toFixed(1)}" data-y="${((y(num(r.valor)) / H) * 100).toFixed(1)}" data-i="${i}"/>`;
    })
    .join("");
  const ejeX = `<text x="${L}" y="${H - 8}" class="eje">${esc(fechaCorta(pts[0]._fecha))}</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end" class="eje">${esc(fechaCorta(pts[pts.length - 1]._fecha))}</text>`;

  return `<div class="grafico">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de ${esc(ind.nombre)}">
      ${banda}
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="base"/>
      ${ejeY}${ejeX}
      <path d="${linea}" fill="none" stroke="var(--linea)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${puntos}
    </svg>
    <div class="tip" hidden></div>
    ${min != null || max != null ? `<div class="grafico-leyenda"><span class="muestra-banda"></span> Rango de referencia (${esc(rangoTexto(ind.ultimo))} ${esc(ind.ultimo.unidad)})</div>` : ""}
  </div>`;
}

function filaIndicador(ind) {
  const u = ind.ultimo;
  const v = num(u.valor);
  return `<button type="button" class="fila-ind" data-analito="${esc(ind.clave)}">
    <span class="fila-ind-nombre">
      <strong>${esc(ind.nombre)}</strong>
      <small>${esc(fechaLarga(u._fecha))}${ind.serie.length > 1 ? ` · ${ind.serie.length} mediciones` : ""}</small>
    </span>
    ${sparkline(ind)}
    <span class="fila-ind-valor">
      <strong>${esc(fmt(v ?? u.valor))}</strong>${u.unidad ? ` <small>${esc(u.unidad)}</small>` : ""}
      ${pill(ind.estado)}
    </span>
  </button>`;
}

// ---------- Vistas ----------

function edad(nac) {
  const d = aFecha(nac);
  if (!d) return null;
  const h = hoyUTC();
  let e = h.getUTCFullYear() - d.getUTCFullYear();
  if (h.getUTCMonth() < d.getUTCMonth() || (h.getUTCMonth() === d.getUTCMonth() && h.getUTCDate() < d.getUTCDate())) e--;
  return e;
}

function pintarHero() {
  const p = D.perfil;
  const nombre = String(p.nombre || "").split(" ")[0];
  $("saludo").textContent = nombre ? `Hola, ${nombre}` : "Hola";
  const chips = [];
  const e = edad(p.nacimiento);
  if (e != null) chips.push(`${e} años`);
  const peso = num(p.peso_kg), talla = num(p.talla_m);
  if (peso) chips.push(`${fmt(peso)} kg`);
  if (talla) chips.push(`${fmt(talla)} m`);
  if (peso && talla) chips.push(`IMC ${fmt(Math.round((peso / (talla * talla)) * 10) / 10)}`);
  const act = aFecha(p.actualizado);
  if (act) chips.push(`Actualizado ${fechaLarga(act)}`);
  $("heroChips").innerHTML = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("");
}

function textoDias(d) {
  if (!d) return "";
  const n = diasHasta(d);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n > 1) return `en ${n} días`;
  if (n === -1) return "ayer";
  return `hace ${-n} días`;
}

const pendientes = () =>
  D.agenda
    .filter((a) => norm(a.estado) !== "hecho")
    .sort((a, b) => (a._fecha || Infinity) - (b._fecha || Infinity));

function itemAgenda(a) {
  const hecho = norm(a.estado) === "hecho";
  const atrasado = !hecho && a._fecha && diasHasta(a._fecha) < 0;
  return `<li class="agenda-item${hecho ? " hecho" : ""}">
    <div class="agenda-fecha${atrasado ? " atrasado" : ""}">
      ${a._fecha ? `<strong>${a._fecha.getUTCDate()}</strong><span>${MESES[a._fecha.getUTCMonth()]}</span>` : `<strong>·</strong><span>s/f</span>`}
    </div>
    <div class="agenda-cuerpo">
      <strong>${esc(a.titulo)}</strong>
      ${a.detalle ? `<p>${esc(a.detalle)}</p>` : ""}
      <small>${esc(a.tipo || "")}${a._fecha ? ` · ${hecho ? "hecho" : atrasado ? `atrasado (${textoDias(a._fecha)})` : textoDias(a._fecha)}` : ""}</small>
    </div>
  </li>`;
}

function tarjetaDiagnostico(d) {
  const nivel = ESTADOS[norm(d.nivel)] ? norm(d.nivel) : "info";
  const etiqueta = { ok: "Controlado", atencion: "En seguimiento", alerta: "Prioritario", info: "Informativo" }[ESTADOS[nivel].cls];
  const bloque = (t, c) => (c ? `<h4>${t}</h4><p>${esc(c)}</p>` : "");
  return `<details class="card dx dx-${ESTADOS[nivel].cls}">
    <summary>
      <span class="dx-titulo"><strong>${esc(d.nombre)}</strong><small>${esc(d.area || "")}${d.desde ? ` · desde ${esc(d.desde)}` : ""}</small></span>
      ${pill(nivel, etiqueta)}
    </summary>
    <div class="dx-cuerpo">
      ${d.resumen ? `<p class="dx-resumen">${esc(d.resumen)}</p>` : ""}
      ${bloque("En qué se basa", d.evidencia)}
      ${bloque("Qué sigue", d.que_sigue)}
      ${d.medico ? `<p class="dx-medico">Médico tratante: ${esc(d.medico)}</p>` : ""}
    </div>
  </details>`;
}

function tarjetaMedicamento(m) {
  const est = norm(m.estado);
  const nivel = est === "activo" ? "ok" : est === "no tomado" ? "atencion" : "info";
  return `<div class="med">
    <div class="med-icono" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/></svg>
    </div>
    <div class="med-cuerpo">
      <strong>${esc(m.nombre)} ${m.dosis ? `<span class="med-dosis">${esc(m.dosis)}</span>` : ""}</strong>
      ${m.como ? `<p>${esc(m.como)}</p>` : ""}
      <small>${esc(m.para_que || "")}${m.desde ? ` · desde ${esc(m.desde)}` : ""}${m.hasta ? ` hasta ${esc(m.hasta)}` : ""}</small>
      ${m.nota ? `<p class="med-nota">${esc(m.nota)}</p>` : ""}
    </div>
    ${pill(nivel, m.estado || "—")}
  </div>`;
}

function vistaInicio() {
  const fuera = D.indicadores.filter(esAtencion);
  const enRango = D.indicadores.filter((i) => i.estado === "ok").length;
  const prox = pendientes().filter((a) => a._fecha);
  const sig = prox.find((a) => diasHasta(a._fecha) >= 0) || prox[0];
  const activos = D.medicamentos.filter((m) => norm(m.estado) === "activo");

  return `
  <div class="tiles">
    <a class="tile tile-${fuera.length ? "atencion" : "ok"}" href="#indicadores">
      <span class="tile-num">${fuera.length}</span>
      <span class="tile-txt">fuera de rango</span>
    </a>
    <a class="tile tile-ok" href="#indicadores">
      <span class="tile-num">${enRango}</span>
      <span class="tile-txt">en rango</span>
    </a>
    <a class="tile tile-info" href="#plan">
      <span class="tile-num">${sig ? `${sig._fecha.getUTCDate()} ${MESES[sig._fecha.getUTCMonth()]}` : "—"}</span>
      <span class="tile-txt">${sig ? esc(sig.titulo) : "sin citas"}</span>
    </a>
  </div>

  <h2>Requiere atención</h2>
  <div class="card lista">
    ${fuera.length ? fuera.map(filaIndicador).join("") : `<p class="vacio">Todos tus indicadores más recientes están dentro del rango de referencia.</p>`}
  </div>

  <h2>Mis diagnósticos</h2>
  ${D.diagnosticos.map(tarjetaDiagnostico).join("") || `<div class="card"><p class="vacio">Sin diagnósticos registrados.</p></div>`}

  <h2>Próximos pasos</h2>
  <div class="card">
    <ul class="agenda">${pendientes().slice(0, 4).map(itemAgenda).join("") || `<li class="vacio">Nada pendiente.</li>`}</ul>
    <a class="link-mas" href="#plan">Ver todo el plan</a>
  </div>

  <h2>Medicamentos en uso</h2>
  <div class="card">${activos.map(tarjetaMedicamento).join("") || `<p class="vacio">Sin medicamentos activos.</p>`}</div>`;
}

let filtroInd = "todos";
let busqueda = "";

function vistaIndicadores() {
  const q = norm(busqueda);
  const lista = D.indicadores.filter(
    (i) =>
      (filtroInd === "todos" || (filtroInd === "atencion" ? esAtencion(i) : i.grupo === filtroInd)) &&
      (!q || norm(i.nombre).includes(q) || norm(i.grupo).includes(q))
  );
  const grupos = [...new Set(D.indicadores.map((i) => i.grupo))];
  const chip = (id, txt) =>
    `<button type="button" class="filtro${filtroInd === id ? " activo" : ""}" data-filtro="${esc(id)}">${esc(txt)}</button>`;

  const porGrupo = new Map();
  for (const i of lista) {
    if (!porGrupo.has(i.grupo)) porGrupo.set(i.grupo, []);
    porGrupo.get(i.grupo).push(i);
  }

  return `
  <input type="search" id="buscar" class="buscar" placeholder="Buscar indicador…" value="${esc(busqueda)}" aria-label="Buscar indicador">
  <div class="filtros">
    ${chip("todos", "Todos")}${chip("atencion", `Fuera de rango (${D.indicadores.filter(esAtencion).length})`)}
    ${grupos.map((g) => chip(g, g)).join("")}
  </div>
  ${
    [...porGrupo]
      .map(([g, inds]) => {
        const n = inds.filter(esAtencion).length;
        return `<h2>${esc(g)} ${n ? `<span class="cuenta cuenta-atencion">${n} fuera de rango</span>` : `<span class="cuenta">todo en rango</span>`}</h2>
        <div class="card lista">${inds.map(filaIndicador).join("")}</div>`;
      })
      .join("") || `<div class="card"><p class="vacio">Ningún indicador calza con el filtro.</p></div>`
  }`;
}

let filtroEx = "Todos";

function vistaExamenes() {
  const cats = ["Todos", ...new Set(D.examenes.map((e) => e.categoria).filter(Boolean))];
  const lista = D.examenes.filter((e) => filtroEx === "Todos" || e.categoria === filtroEx);
  const porAnio = new Map();
  for (const e of lista) {
    const a = e._fecha ? e._fecha.getUTCFullYear() : "Sin fecha";
    if (!porAnio.has(a)) porAnio.set(a, []);
    porAnio.get(a).push(e);
  }
  const iconos = {
    laboratorio: `<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>`,
    imagen: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/>`,
    consulta: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  };
  const item = (e) => {
    const nivel = ESTADOS[norm(e.estado)] ? norm(e.estado) : "info";
    const etiqueta = { ok: "Normal", atencion: "Con hallazgos", alerta: "Alerta", info: "Informativo" }[ESTADOS[nivel].cls];
    return `<details class="card ex">
      <summary>
        <span class="ex-icono ex-${norm(e.categoria)}" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconos[norm(e.categoria)] || iconos.consulta}</svg>
        </span>
        <span class="ex-titulo"><strong>${esc(e.titulo)}</strong><small>${esc(fechaLarga(e._fecha))} · ${esc(e.categoria || "")}</small></span>
        ${pill(nivel, etiqueta)}
      </summary>
      <div class="ex-cuerpo">
        <p>${esc(e.resumen)}</p>
        ${e.centro ? `<small>${esc(e.centro)}</small>` : ""}
        ${/^https:\/\//.test(e.link) ? `<a class="link-mas" href="${esc(e.link)}" target="_blank" rel="noopener">Abrir documento en Drive</a>` : ""}
      </div>
    </details>`;
  };
  return `
  <div class="filtros">${cats
    .map((c) => `<button type="button" class="filtro${filtroEx === c ? " activo" : ""}" data-filtro-ex="${esc(c)}">${esc(c)}</button>`)
    .join("")}</div>
  ${[...porAnio].map(([a, es]) => `<h2>${esc(a)} <span class="cuenta">${es.length}</span></h2>${es.map(item).join("")}`).join("")}`;
}

function vistaPlan() {
  const pend = pendientes();
  const hechos = D.agenda.filter((a) => norm(a.estado) === "hecho").sort((a, b) => (b._fecha || 0) - (a._fecha || 0));
  const porMedico = new Map();
  for (const p of D.preguntas.filter((p) => norm(p.estado) !== "resuelta")) {
    if (!porMedico.has(p.para)) porMedico.set(p.para, []);
    porMedico.get(p.para).push(p);
  }
  return `
  <h2>Agenda y pendientes</h2>
  <div class="card"><ul class="agenda">${pend.map(itemAgenda).join("") || `<li class="vacio">Nada pendiente.</li>`}</ul></div>
  ${hechos.length ? `<details class="card plegable"><summary>Ya hecho (${hechos.length})</summary><ul class="agenda">${hechos.map(itemAgenda).join("")}</ul></details>` : ""}

  <h2>Preguntas para mis médicos</h2>
  ${
    [...porMedico]
      .map(([m, ps]) => `<div class="card preguntas"><h3>${esc(m)}</h3><ul>${ps.map((p) => `<li>${esc(p.pregunta)}</li>`).join("")}</ul></div>`)
      .join("") || `<div class="card"><p class="vacio">Sin preguntas pendientes.</p></div>`
  }

  <h2>Medicamentos</h2>
  <div class="card">${D.medicamentos.map(tarjetaMedicamento).join("") || `<p class="vacio">Sin medicamentos.</p>`}</div>

  <h2>Bitácora</h2>
  <details class="card plegable">
    <summary>Historial de revisiones (${D.bitacora.length})</summary>
    <ul class="bitacora">${D.bitacora.map((b) => `<li><strong>${esc(fechaLarga(b._fecha))}</strong><p>${esc(b.nota)}</p></li>`).join("")}</ul>
  </details>`;
}

// ---------- Detalle de un indicador ----------

function abrirIndicador(clave) {
  const ind = D.indicadores.find((i) => i.clave === clave);
  if (!ind) return;
  const u = ind.ultimo, g = ind.glosario, v = num(u.valor);
  const bloque = (t, c, cls = "") => (c ? `<section class="det-bloque ${cls}"><h4>${t}</h4><p>${esc(c)}</p></section>` : "");
  const filas = [...ind.serie]
    .reverse()
    .map(
      (r) => `<tr>
        <td>${esc(fechaLarga(r._fecha))}${r.nota ? `<small class="nota">${esc(r.nota)}</small>` : ""}</td>
        <td class="n"><strong>${esc(fmt(num(r.valor) ?? r.valor))}</strong></td>
        <td class="n">${esc(rangoTexto(r))}</td>
        <td>${pill(r._estado)}</td>
      </tr>`
    )
    .join("");

  $("hojaContenido").innerHTML = `
    <p class="det-grupo">${esc(ind.grupo)}</p>
    <h2 id="hojaTitulo">${esc(ind.nombre)}</h2>
    <div class="det-valor">
      <span class="det-num">${esc(fmt(v ?? u.valor))}</span>
      <span class="det-unidad">${esc(u.unidad || "")}</span>
      ${pill(ind.estado)}
    </div>
    <p class="det-meta">${esc(fechaLarga(u._fecha))}${u.laboratorio ? ` · ${esc(u.laboratorio)}` : ""}</p>
    ${tendencia(ind) ? `<p class="det-meta">${tendencia(ind)}</p>` : ""}
    ${barraRango(u)}
    ${bloque("Tu lectura", g.lectura, "det-lectura")}
    ${ind.serie.length > 1 ? `<h4 class="det-h">Evolución</h4>${grafico(ind)}` : ""}
    ${bloque("Qué mide", g.que_mide)}
    ${bloque("Si está alto", g.si_alto)}
    ${bloque("Si está bajo", g.si_bajo)}
    <h4 class="det-h">Historial</h4>
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th class="n">Valor</th><th class="n">Referencia</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
  $("hojaFondo").hidden = false;
  document.body.classList.add("sin-scroll");
  $("hoja").scrollTop = 0;
  $("hojaCerrar").focus();
}

function cerrarHoja() {
  $("hojaFondo").hidden = true;
  document.body.classList.remove("sin-scroll");
}

function mostrarTip(el) {
  const caja = el.closest(".grafico");
  const tip = caja.querySelector(".tip");
  const [fecha, valor, estado] = el.dataset.tip.split("|");
  tip.innerHTML = `<small>${fecha}</small><strong>${valor}</strong>${estado ? `<small>${estado}</small>` : ""}`;
  tip.hidden = false;
  const x = Number(el.dataset.x);
  tip.style.left = `${Math.max(18, Math.min(82, x))}%`;
  tip.style.top = `${el.dataset.y}%`;
}

// ---------- Navegación y arranque ----------

const VISTAS = { inicio: vistaInicio, indicadores: vistaIndicadores, examenes: vistaExamenes, plan: vistaPlan };

function pintar() {
  if (!D) return;
  const tab = VISTAS[location.hash.slice(1)] ? location.hash.slice(1) : "inicio";
  for (const k of Object.keys(VISTAS)) {
    const el = $(`vista-${k}`);
    el.hidden = k !== tab;
    if (k === tab) el.innerHTML = VISTAS[k]();
  }
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("activo", a.dataset.tab === tab));
  $("pie").hidden = false;
}

async function cargar() {
  $("error").hidden = true;
  $("cargando").hidden = false;
  try {
    // __DATOS_PRUEBA__ solo existe en la vista previa local (archivo fuera del repo).
    const crudo = window.__DATOS_PRUEBA__ || (await window.SheetsApi.readTabs(window.APP_CONFIG.TABS));
    D = armar(crudo);
    pintarHero();
    pintar();
  } catch (err) {
    console.error(err);
    $("error").hidden = false;
    $("error").innerHTML = `<strong>No se pudieron cargar tus datos.</strong><p>${esc(err.message)}</p>
      <button type="button" class="btn-primary" id="btnReintentar">Volver a entrar</button>`;
    $("btnReintentar").addEventListener("click", () => location.replace("login.html"));
  } finally {
    $("cargando").hidden = true;
  }
}

function init() {
  if (!window.__DATOS_PRUEBA__ && !window.SheetsAuth.requireAuthOrRedirect()) return;

  window.addEventListener("hashchange", () => {
    pintar();
    window.scrollTo(0, 0);
  });

  document.addEventListener("click", (ev) => {
    const ind = ev.target.closest("[data-analito]");
    if (ind) return abrirIndicador(ind.dataset.analito);
    const f = ev.target.closest("[data-filtro]");
    if (f) {
      filtroInd = f.dataset.filtro;
      return pintar();
    }
    const fe = ev.target.closest("[data-filtro-ex]");
    if (fe) {
      filtroEx = fe.dataset.filtroEx;
      return pintar();
    }
    const p = ev.target.closest(".punto-toque");
    if (p) return mostrarTip(p);
    if (ev.target === $("hojaFondo") || ev.target.closest("#hojaCerrar")) cerrarHoja();
  });
  document.addEventListener("pointerover", (ev) => {
    const p = ev.target.closest?.(".punto-toque");
    if (p) mostrarTip(p);
  });
  document.addEventListener("focusin", (ev) => {
    if (ev.target.classList?.contains("punto-toque")) mostrarTip(ev.target);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("hojaFondo").hidden) cerrarHoja();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id !== "buscar") return;
    busqueda = ev.target.value;
    pintar();
    const b = $("buscar");
    b.focus();
    b.setSelectionRange(b.value.length, b.value.length);
  });

  $("btnRecargar").addEventListener("click", cargar);
  $("btnSalir").addEventListener("click", () => {
    if (!confirm("¿Cerrar la sesión de Google en esta app?")) return;
    window.SheetsAuth.logout();
    location.replace("login.html");
  });

  cargar();
}

init();
