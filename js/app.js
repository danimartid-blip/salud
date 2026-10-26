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
    cuerpo: aObjetos(crudo.Cuerpo),
    metas: aObjetos(crudo.Metas).filter((m) => m.id !== "" && norm(m.activo) !== "no"),
    registro: aObjetos(crudo.Registro),
    habitos: aObjetos(crudo.Habitos),
    conclusiones: aObjetos(crudo.Conclusiones).filter((c) => c.titulo),
    familia: conFecha(crudo.Familia).filter((f) => f.id !== "" && f.pregunta),
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

/** Otras fichas que esta persona puede mirar. Salen de la clave `otros_perfiles`
 * de SU propia planilla (una por línea: "Nombre | ID"), y se recuerdan en el
 * celular para seguir mostrándolas mientras mira la ficha de otro. */
function otrasFichas() {
  if (!window.APP_CONFIG.VIENDO_OTRA) {
    const lista = String(D.perfil.otros_perfiles || "")
      .split(/[\n;]+/)
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter(([nombre, id]) => nombre && /^[\w-]{25,80}$/.test(id || ""))
      .map(([nombre, id]) => ({ nombre, id }));
    try {
      localStorage.setItem("salud_fichas", JSON.stringify({ propia: String(D.perfil.nombre || "Mi ficha").split(" ")[0], lista }));
    } catch {}
  }
  try {
    return JSON.parse(localStorage.getItem("salud_fichas") || "null") || { propia: "Mi ficha", lista: [] };
  } catch {
    return { propia: "Mi ficha", lista: [] };
  }
}

function cambiarFicha(id) {
  try {
    if (!id || id === window.APP_CONFIG.PLANILLA_PROPIA) sessionStorage.removeItem("salud_ver");
    else sessionStorage.setItem("salud_ver", id);
  } catch {}
  location.hash = "inicio";
  location.reload();
}

function abrirFichas() {
  const { propia, lista } = otrasFichas();
  const actual = window.APP_CONFIG.SPREADSHEET_ID;
  const fila = (nombre, id, sub) => `<button type="button" class="ficha${id === actual ? " actual" : ""}" data-ficha="${esc(id)}">
      <span class="ficha-inicial" aria-hidden="true">${esc(nombre.charAt(0).toUpperCase())}</span>
      <span class="ficha-txt"><strong>${esc(nombre)}</strong><small>${esc(sub)}</small></span>
      ${id === actual ? `<span class="ficha-marca">Viendo</span>` : ""}
    </button>`;
  mostrarHoja(`
    <p class="det-grupo">Fichas</p>
    <h2 id="hojaTitulo">¿Qué ficha quieres ver?</h2>
    <div class="fichas">
      ${fila(propia, window.APP_CONFIG.PLANILLA_PROPIA, "Mi ficha")}
      ${lista.map((f) => fila(f.nombre, f.id, "Ficha familiar")).join("")}
    </div>`);
}

function pintarHero() {
  const p = D.perfil;
  const nombre = String(p.nombre || "").split(" ")[0];
  const otra = window.APP_CONFIG.VIENDO_OTRA;
  document.querySelector(".hero-kicker").textContent = otra ? "Ficha de" : "Mi Salud";
  $("saludo").textContent = otra ? nombre || "Ficha familiar" : nombre ? `Hola, ${nombre}` : "Hola";
  document.body.classList.toggle("viendo-otra", otra);
  const act = aFecha(p.actualizado);
  $("heroChips").innerHTML =
    (otra ? `<button type="button" class="chip chip-volver" data-ficha="${esc(window.APP_CONFIG.PLANILLA_PROPIA)}">← Volver a mi ficha</button>` : "") +
    (act ? `<span class="chip">Actualizado ${esc(fechaLarga(act))}</span>` : "");
  $("btnFichas").hidden = !(otrasFichas().lista.length || otra);
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
    <button type="button" class="agenda-check" data-agenda-toggle="${D.agenda.indexOf(a)}" role="checkbox" aria-checked="${hecho}"
      aria-label="${hecho ? "Volver a pendientes" : "Marcar como hecho"}: ${esc(a.titulo)}" title="${hecho ? "Volver a pendientes" : "Marcar como hecho"}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
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

// ---------- Inicio: resumen ejecutivo ----------

const NIVEL_TXT = { ok: "Bien", atencion: "En seguimiento", alerta: "Prioritario", info: "Para saber" };
const HABITO_TXT = { ok: "Bien", atencion: "Por mejorar", alerta: "Urgente", info: "Por confirmar" };
const nivelDe = (x) => (ESTADOS[norm(x)] ? ESTADOS[norm(x)].cls : "info");

/** Edad exacta en años, meses y días, y cuánto falta para el próximo cumpleaños. */
function edadExacta(nac) {
  const n = aFecha(nac);
  if (!n) return null;
  const h = hoyUTC();
  let a = h.getUTCFullYear() - n.getUTCFullYear();
  let m = h.getUTCMonth() - n.getUTCMonth();
  let d = h.getUTCDate() - n.getUTCDate();
  if (d < 0) {
    m--;
    // días del mes anterior al actual
    d += new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0)).getUTCDate();
  }
  if (m < 0) {
    a--;
    m += 12;
  }
  let prox = new Date(Date.UTC(h.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  if (prox < h) prox = new Date(Date.UTC(h.getUTCFullYear() + 1, n.getUTCMonth(), n.getUTCDate()));
  return { a, m, d, faltan: Math.round((prox - h) / 86400000), cumple: a + (prox > h ? 1 : 0), prox };
}

// Posición de cada zona sobre la figura (viewBox 360×430). La figura se mira de
// frente: el lado derecho del paciente queda a la izquierda de la pantalla.
// `lado` decide a qué costado va la etiqueta y `ly` su altura.
const ZONAS = {
  cerebro: { x: 180, y: 30, lado: "der", ly: 24 },
  ojos: { x: 189, y: 42, lado: "der", ly: 54 },
  oidos: { x: 160, y: 48, lado: "izq", ly: 44 },
  tiroides: { x: 180, y: 86, lado: "der", ly: 82 },
  pulmones: { x: 163, y: 128, lado: "izq", ly: 122 },
  corazon: { x: 193, y: 136, lado: "der", ly: 130 },
  higado: { x: 163, y: 172, lado: "izq", ly: 170 },
  rinones: { x: 203, y: 184, lado: "der", ly: 176 },
  sangre: { x: 122, y: 208, lado: "izq", ly: 216 },
  digestivo: { x: 180, y: 208, lado: "der", ly: 214 },
  ingle: { x: 197, y: 252, lado: "der", ly: 256 },
  huesos: { x: 156, y: 338, lado: "izq", ly: 338 },
};

function cuerpo() {
  const ubicadas = D.cuerpo.filter((z) => ZONAS[norm(z.zona)]);
  const sueltas = D.cuerpo.filter((z) => !ZONAS[norm(z.zona)]);

  const marcas = ubicadas
    .map((z, i) => {
      const p = ZONAS[norm(z.zona)];
      const cls = nivelDe(z.nivel);
      const izq = p.lado === "izq";
      const xl = izq ? 86 : 274; // donde termina la línea guía
      const xt = izq ? 82 : 278; // donde parte el texto
      const activo = cls === "atencion" || cls === "alerta";
      return `<g class="zona zona-${cls}" data-zona="${esc(norm(z.zona))}" tabindex="0" role="button" aria-label="${esc(z.titulo)}: ${esc(NIVEL_TXT[cls])}">
        <path d="M${p.x} ${p.y} L${izq ? xl + 14 : xl - 14} ${p.ly} H${xl}" class="zona-guia"/>
        <circle cx="${p.x}" cy="${p.y}" r="${activo ? 7 : 5}" class="zona-pulso" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>
        <circle cx="${p.x}" cy="${p.y}" r="${activo ? 7 : 5}" class="zona-punto"/>
        <text x="${xt}" y="${p.ly - 1}" text-anchor="${izq ? "end" : "start"}" class="zona-nombre">${esc(z.titulo)}</text>
        <text x="${xt}" y="${p.ly + 11}" text-anchor="${izq ? "end" : "start"}" class="zona-estado">${esc(NIVEL_TXT[cls])}</text>
        <rect x="${izq ? 0 : xl - 16}" y="${p.ly - 14}" width="${izq ? xl + 16 : 360 - xl + 16}" height="30" fill="transparent"/>
        <circle cx="${p.x}" cy="${p.y}" r="16" fill="transparent"/>
      </g>`;
    })
    .join("");

  const cuenta = (c) => D.cuerpo.filter((z) => nivelDe(z.nivel) === c).length;
  const seguimiento = cuenta("atencion") + cuenta("alerta");

  return `<div class="escaner">
    <div class="escaner-cab">
      <div>
        <strong><i class="vivo" aria-hidden="true"></i>Escáner en vivo</strong>
      </div>
      ${
        seguimiento
          ? `<span class="escaner-aviso"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3 2 20h20z" fill="#ffc533"/><path d="M12 10v4.5M12 17.2v.3" stroke="#3a2a00" stroke-width="2.2" stroke-linecap="round"/></svg>${seguimiento} en seguimiento</span>`
          : `<span class="escaner-aviso">✓ Todo en orden</span>`
      }
    </div>
    <svg viewBox="0 0 360 430" class="escaner-svg" role="group" aria-label="Estado por zona del cuerpo">
      <defs>
        <linearGradient id="gBarrido" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0.32"/>
        </linearGradient>
      </defs>
      <g class="rejilla">
        ${[70, 140, 210, 280, 350].map((y) => `<line x1="96" x2="264" y1="${y}" y2="${y}"/>`).join("")}
      </g>
      <g class="figura">
        <ellipse cx="180" cy="44" rx="21" ry="25"/>
        <path d="M179 60 L190 60 C190 82 192 88 206 92 C222 96 236 100 238 118 C240 140 244 160 246 182 C248 204 256 226 258 248 C259 256 262 264 258 270 C254 276 246 272 245 262 C242 240 234 216 231 194 C229 176 226 158 224 142 C222 160 218 184 216 204 C215 222 222 240 224 262 C226 300 222 330 218 352 C216 372 218 392 214 412 C213 420 216 426 210 428 L196 428 C192 426 194 418 194 410 C194 388 192 368 192 350 C192 320 186 290 182 268 L179 266 Z"/>
        <path d="M179 60 L190 60 C190 82 192 88 206 92 C222 96 236 100 238 118 C240 140 244 160 246 182 C248 204 256 226 258 248 C259 256 262 264 258 270 C254 276 246 272 245 262 C242 240 234 216 231 194 C229 176 226 158 224 142 C222 160 218 184 216 204 C215 222 222 240 224 262 C226 300 222 330 218 352 C216 372 218 392 214 412 C213 420 216 426 210 428 L196 428 C192 426 194 418 194 410 C194 388 192 368 192 350 C192 320 186 290 182 268 L179 266 Z" transform="translate(360 0) scale(-1 1)"/>
      </g>
      <rect x="92" y="0" width="176" height="46" fill="url(#gBarrido)" class="barrido"/>
      ${marcas}
    </svg>
    ${
      sueltas.length
        ? `<div class="escaner-chips">${sueltas
            .map((z) => {
              const cls = nivelDe(z.nivel);
              return `<button type="button" class="escaner-chip zona-${cls}" data-zona="${esc(norm(z.zona))}"><i></i>${esc(z.titulo)} · ${esc(NIVEL_TXT[cls])}</button>`;
            })
            .join("")}</div>`
        : ""
    }
  </div>`;
}

const imcDe = (p) => {
  const peso = num(p.peso_kg), talla = num(p.talla_m);
  return peso && talla ? peso / (talla * talla) : null;
};

/** Regla de IMC con las tres franjas, dónde estás hoy y dónde queda tu meta. */
function reglaImc(p) {
  const imc = imcDe(p);
  if (imc == null) return "";
  const talla = num(p.talla_m), meta = num(p.meta_peso_kg);
  const lo = 18.5, hi = 35;
  const pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const imcMeta = meta ? meta / (talla * talla) : null;
  return `<div class="imc">
    <div class="imc-pista">
      <span class="imc-f imc-normal" style="width:${pct(25)}%"></span>
      <span class="imc-f imc-sobre" style="width:${pct(30) - pct(25)}%"></span>
      <span class="imc-f imc-obes" style="width:${100 - pct(30)}%"></span>
      ${imcMeta ? `<span class="imc-meta" style="left:${pct(imcMeta)}%" title="Meta"></span>` : ""}
      <span class="imc-hoy" style="left:${pct(imc)}%"></span>
    </div>
    <div class="imc-ejes"><span style="left:0">18,5</span><span style="left:${pct(25)}%">25</span><span style="left:${pct(30)}%">30</span></div>
    <div class="imc-leyenda"><span><i class="l-hoy"></i>Hoy</span>${imcMeta ? `<span><i class="l-meta"></i>Meta</span>` : ""}<span><i class="l-normal"></i>Normal</span><span><i class="l-sobre"></i>Sobrepeso</span><span><i class="l-obes"></i>Obesidad</span></div>
  </div>`;
}

const ICONOS_HABITO = {
  ejercicio: `<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>`,
  alimentacion: `<path d="M12 7c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1-.6 2-.6s1 .6 2 .6c2 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 7c0-2 1-3 3-4"/>`,
  peso: `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 10a4 4 0 0 1 8 0M12 10l2-2"/>`,
  estres: `<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>`,
  pausas: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  sueno: `<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>`,
  alcohol: `<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v6M9 20h6"/>`,
  tabaco: `<path d="M3 15h13v3H3zM19 15v3M21 15v3M17 11c0-2 3-2 3-4"/>`,
  medicamento: `<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>`,
};
const iconoHabito = (k) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS_HABITO[norm(k)] || `<circle cx="12" cy="12" r="8"/>`}</svg>`;

/** Pendientes como línea de tiempo horizontal: ocupa una franja y se desliza. */
function lineaTiempo() {
  const lista = pendientes();
  if (!lista.length) return `<div class="card"><p class="vacio">Nada pendiente.</p></div>`;
  return `<div class="tiempo" role="list">${lista
    .map((a) => {
      const i = D.agenda.indexOf(a);
      const atrasado = a._fecha && diasHasta(a._fecha) < 0;
      return `<button type="button" class="tiempo-item${atrasado ? " atrasado" : ""}${a._fecha ? "" : " sin-fecha"}" data-pendiente="${i}" role="listitem">
        <span class="tiempo-fecha">${a._fecha ? `${a._fecha.getUTCDate()} ${MESES[a._fecha.getUTCMonth()]}` : "Sin fecha"}</span>
        <span class="tiempo-nodo" aria-hidden="true"></span>
        <strong>${esc(a.titulo)}</strong>
        <small>${a._fecha ? (atrasado ? `atrasado · ${textoDias(a._fecha)}` : textoDias(a._fecha)) : esc(a.tipo || "")}</small>
      </button>`;
    })
    .join("")}</div>`;
}

function vistaInicio() {
  const p = D.perfil;
  const fuera = D.indicadores.filter(esAtencion).length;
  const enRango = D.indicadores.filter((i) => i.estado === "ok").length;
  const conRango = fuera + enRango;
  const e = edadExacta(p.nacimiento);
  const imc = imcDe(p);
  const peso = num(p.peso_kg), meta = num(p.meta_peso_kg);

  return `
  ${avisoFamilia()}
  <div class="kpis">
    ${
      e
        ? `<button type="button" class="kpi" data-kpi="edad">
      <span class="kpi-rot">Edad</span>
      <span class="kpi-num">${e.a}<small> años</small></span>
      <span class="kpi-sub">${e.m} ${e.m === 1 ? "mes" : "meses"}<br>${e.d} ${e.d === 1 ? "día" : "días"}</span>
    </button>`
        : ""
    }
    <button type="button" class="kpi" data-ir-filtro="${fuera ? "atencion" : "todos"}">
      <span class="kpi-rot">Indicadores</span>
      <span class="kpi-num">${enRango}<small> de ${conRango}</small></span>
      <span class="kpi-sub">en rango<br>${fuera ? `<strong>${fuera} fuera</strong>` : "ninguno fuera"}</span>
      <span class="kpi-barra" aria-hidden="true"><i style="width:${conRango ? (enRango / conRango) * 100 : 0}%"></i></span>
    </button>
    ${
      imc != null
        ? `<button type="button" class="kpi" data-kpi="peso">
      <span class="kpi-rot">Peso</span>
      <span class="kpi-num">${fmt(peso)}<small> kg</small></span>
      <span class="kpi-sub">IMC ${fmt(Math.round(imc * 10) / 10)}${meta ? `<br>meta <strong>${fmt(meta)} kg</strong>` : ""}</span>
    </button>`
        : ""
    }
  </div>

  ${D.cuerpo.length ? cuerpo() : ""}

  <h2>Pendientes <a class="h2-link" href="#plan">Ver plan</a></h2>
  ${lineaTiempo()}`;
}

function abrirPendiente(i) {
  const a = D.agenda[i];
  if (!a) return;
  const atrasado = a._fecha && diasHasta(a._fecha) < 0;
  mostrarHoja(`
    <p class="det-grupo">${esc(a.tipo || "Pendiente")}</p>
    <h2 id="hojaTitulo">${esc(a.titulo)}</h2>
    <div class="det-valor">${pill(atrasado ? "atencion" : "info", a._fecha ? (atrasado ? `Atrasado · ${textoDias(a._fecha)}` : textoDias(a._fecha)) : "Sin fecha")}</div>
    ${a._fecha ? `<p class="det-meta">${esc(fechaLarga(a._fecha))}</p>` : ""}
    ${bloqueDet("Detalle", a.detalle, "det-lectura")}
    ${
      norm(a.estado) === "hecho"
        ? `<button type="button" class="btn-hecho deshacer" data-agenda-toggle="${i}">Volver a pendientes</button>`
        : `<button type="button" class="btn-hecho" data-agenda-toggle="${i}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> Marcar como hecho</button>`
    }
    <a class="link-mas" href="#plan" data-cerrar>Ver todo el plan</a>`);
}

/** Tarjetas de hábitos: viven en la pestaña Plan. */
function tarjetasHabitos() {
  const orden = { alerta: 0, atencion: 1, info: 2, ok: 3 };
  return D.habitos
    .map((h, i) => ({ ...h, _i: i }))
    .sort((a, b) => orden[nivelDe(a.nivel)] - orden[nivelDe(b.nivel)])
    .map((h) => {
      const cls = nivelDe(h.nivel);
      return `<button type="button" class="habito habito-${cls}" data-habito="${h._i}">
        <span class="habito-icono">${iconoHabito(h.icono)}</span>
        <strong>${esc(h.nombre)}</strong>
        <span class="habito-txt">${esc(h.resumen)}</span>
        ${pill(cls, HABITO_TXT[cls])}
      </button>`;
    })
    .join("");
}

function mostrarHoja(html) {
  $("hojaContenido").innerHTML = html;
  $("hojaFondo").hidden = false;
  document.body.classList.add("sin-scroll");
  $("hoja").scrollTop = 0;
  $("hojaCerrar").focus();
}

const bloqueDet = (t, c, cls = "") => (c ? `<section class="det-bloque ${cls}"><h4>${t}</h4><p>${esc(c)}</p></section>` : "");

function abrirZona(clave) {
  const z = D.cuerpo.find((x) => norm(x.zona) === clave);
  if (!z) return;
  const cls = nivelDe(z.nivel);
  const grupos = String(z.grupos || "").split(",").map(norm).filter(Boolean);
  const inds = D.indicadores.filter((i) => grupos.includes(norm(i.grupo)));
  mostrarHoja(`
    <p class="det-grupo">Zona</p>
    <h2 id="hojaTitulo">${esc(z.titulo)}</h2>
    <div class="det-valor">${pill(cls, NIVEL_TXT[cls])}</div>
    ${bloqueDet("En resumen", z.resumen, "det-lectura")}
    ${bloqueDet("Qué sigue", z.que_sigue)}
    ${inds.length ? `<h4 class="det-h">Indicadores de esta zona</h4><div class="lista lista-hoja">${inds.map(filaIndicador).join("")}</div>` : ""}`);
}

function abrirHabito(i) {
  const h = D.habitos[i];
  if (!h) return;
  const cls = nivelDe(h.nivel);
  mostrarHoja(`
    <p class="det-grupo">Hábito</p>
    <h2 id="hojaTitulo">${esc(h.nombre)}</h2>
    <div class="det-valor">${pill(cls, HABITO_TXT[cls])}</div>
    ${bloqueDet("Cómo estás", h.resumen, "det-lectura")}
    ${bloqueDet("Meta", h.meta)}
    ${bloqueDet("Por qué importa en tu caso", h.detalle)}`);
}

function abrirKpi(cual) {
  const p = D.perfil;
  if (cual === "edad") {
    const e = edadExacta(p.nacimiento);
    return mostrarHoja(`
      <p class="det-grupo">Perfil</p>
      <h2 id="hojaTitulo">Edad</h2>
      <div class="det-valor"><span class="det-num">${e.a}</span><span class="det-unidad">años, ${e.m} ${e.m === 1 ? "mes" : "meses"} y ${e.d} ${e.d === 1 ? "día" : "días"}</span></div>
      <p class="det-meta">Nacimiento: ${esc(fechaLarga(aFecha(p.nacimiento)))}</p>
      ${bloqueDet("Próximo cumpleaños", `Cumples ${e.cumple} el ${fechaLarga(e.prox)}: ${e.faltan === 0 ? "es hoy" : `faltan ${e.faltan} días`}.`, "det-lectura")}
      ${bloqueDet("Antecedentes familiares", p.antecedentes_familiares)}
      ${bloqueDet("Previsión", p.prevision)}`);
  }
  const imc = imcDe(p), peso = num(p.peso_kg), talla = num(p.talla_m), meta = num(p.meta_peso_kg);
  mostrarHoja(`
    <p class="det-grupo">Perfil</p>
    <h2 id="hojaTitulo">Peso e IMC</h2>
    <div class="det-valor"><span class="det-num">${fmt(peso)}</span><span class="det-unidad">kg · ${fmt(talla)} m · IMC ${fmt(Math.round(imc * 10) / 10)}</span></div>
    ${p.peso_fecha ? `<p class="det-meta">Registrado el ${esc(fechaLarga(aFecha(p.peso_fecha)))}</p>` : ""}
    ${reglaImc(p)}
    ${bloqueDet("Tu meta", meta ? `${fmt(meta)} kg (IMC ${fmt(Math.round((meta / (talla * talla)) * 10) / 10)}). ${p.meta_peso || ""}` : p.meta_peso, "det-lectura")}
    ${bloqueDet("Sobre este dato", p.peso_nota)}
    ${bloqueDet("Qué es el IMC", "Peso dividido por la talla al cuadrado. Entre 18,5 y 25 se considera normal, de 25 a 30 sobrepeso y sobre 30 obesidad. Es una referencia general: no distingue músculo de grasa.")}`);
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
  const activos = D.diagnosticos.filter((d) => nivelDe(d.nivel) !== "info");
  const dePaso = D.diagnosticos.filter((d) => nivelDe(d.nivel) === "info");
  const totalPreguntas = [...porMedico.values()].reduce((n, ps) => n + ps.length, 0);

  // Una sección a la vez, con botones arriba (igual que en Conclusiones):
  // Daniel lo pidió porque "tanta información hacia abajo" se perdía.
  const secciones = [
    ["pendientes", "Pendientes", pend.length],
    ["diagnosticos", "Diagnósticos", activos.length],
    ...(D.habitos.length ? [["habitos", "Hábitos", D.habitos.length]] : []),
    ["preguntas", "Preguntas", totalPreguntas],
    ["medicamentos", "Remedios", D.medicamentos.filter((m) => norm(m.estado) === "activo").length],
    ["bitacora", "Bitácora", D.bitacora.length],
  ];
  if (!secciones.some(([id]) => id === subPlan)) subPlan = "pendientes";
  const botones = subPestanas(secciones, subPlan, "data-sub-plan", true);

  const contenido = {
    pendientes: () => `
      <div class="card"><ul class="agenda">${pend.map(itemAgenda).join("") || `<li class="vacio">Nada pendiente.</li>`}</ul></div>
      ${hechos.length ? `<details class="card plegable"><summary>Ya hecho (${hechos.length})</summary><ul class="agenda">${hechos.map(itemAgenda).join("")}</ul></details>` : ""}`,
    diagnosticos: () => `
      ${activos.map(tarjetaDiagnostico).join("") || `<div class="card"><p class="vacio">Sin diagnósticos activos.</p></div>`}
      ${dePaso.length ? `<details class="card plegable"><summary>Hallazgos de paso (${dePaso.length})</summary>${dePaso.map(tarjetaDiagnostico).join("")}</details>` : ""}`,
    habitos: () => `<div class="habitos">${tarjetasHabitos()}</div>`,
    preguntas: () =>
      [...porMedico]
        .map(([m, ps]) => `<div class="card preguntas"><h3>${esc(m)}</h3><ul>${ps.map((p) => `<li>${esc(p.pregunta)}</li>`).join("")}</ul></div>`)
        .join("") || `<div class="card"><p class="vacio">Sin preguntas pendientes.</p></div>`,
    medicamentos: () => `<div class="card">${D.medicamentos.map(tarjetaMedicamento).join("") || `<p class="vacio">Sin medicamentos.</p>`}</div>`,
    bitacora: () => `<div class="card"><ul class="bitacora">${D.bitacora.map((b) => `<li><strong>${esc(fechaLarga(b._fecha))}</strong><p>${esc(b.nota)}</p></li>`).join("") || `<li class="vacio">Sin revisiones.</li>`}</ul></div>`,
  };
  return botones + contenido[subPlan]();
}

let subPlan = "pendientes";

/** Barra de sub-pestañas redondeada y fija arriba. Con muchas secciones
 * (`desliza`), los botones no se reparten el ancho: la barra se desliza. */
function subPestanas(secciones, actual, atributo, desliza = false) {
  const barra = `<div class="filtros revision-tabs${desliza ? " desliza" : ""}" role="tablist">${secciones
    .map(
      ([id, txt, n]) =>
        `<button type="button" role="tab" aria-selected="${actual === id}" class="filtro${actual === id ? " activo" : ""}" ${atributo}="${id}">${txt} <span class="sub-cuenta">${n}</span></button>`
    )
    .join("")}</div>`;
  if (!desliza) return barra;
  // Flechas y difuminado a los costados para que se note que la barra se desliza.
  return `<div class="desliza-wrap al-inicio">${barra}
    <button type="button" class="sub-flecha izq" data-sub-flecha="-1" aria-label="Ver categorías anteriores">‹</button>
    <button type="button" class="sub-flecha der" data-sub-flecha="1" aria-label="Ver más categorías">›</button>
  </div>`;
}

/** Muestra u oculta las flechas según cuánto se haya deslizado la barra. */
function actualizarFlechas(barra) {
  const wrap = barra.parentElement;
  if (!wrap?.classList.contains("desliza-wrap")) return;
  wrap.classList.toggle("al-inicio", barra.scrollLeft < 4);
  wrap.classList.toggle("al-final", barra.scrollLeft + barra.clientWidth >= barra.scrollWidth - 4);
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
  mostrarHoja($("hojaContenido").innerHTML);
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

// Una ficha sin metas diarias (la de un abuelo) usa ese lugar para la Revisión.
const VISTAS = {
  inicio: vistaInicio,
  indicadores: vistaIndicadores,
  examenes: vistaExamenes,
  metas: () => (usaRevision() ? vistaRevision() : vistaMetas()),
  plan: vistaPlan,
};

function pintar() {
  if (!D) return;
  const tab = VISTAS[location.hash.slice(1)] ? location.hash.slice(1) : "inicio";
  for (const k of Object.keys(VISTAS)) {
    const el = $(`vista-${k}`);
    el.hidden = k !== tab;
    if (k === tab) el.innerHTML = VISTAS[k]();
  }
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("activo", a.dataset.tab === tab));
  document.querySelectorAll(".revision-tabs.desliza").forEach((b) => {
    b.onscroll = () => actualizarFlechas(b);
    actualizarFlechas(b);
  });
  $("tabMetasTxt").textContent = usaRevision() ? "Conclusiones" : "Metas";
  $("tabMetasTxt").parentElement.classList.toggle("tab-destacada", usaRevision());
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
    buscarRespuestasNuevas();
  } catch (err) {
    console.error(err);
    $("error").hidden = false;
    $("error").innerHTML = `<strong>No se pudieron cargar tus datos.</strong><p>${esc(err.message)}</p>
      <button type="button" class="btn-primary" id="btnReintentar">Volver a entrar</button>`;
    $("btnReintentar").addEventListener("click", () => {
      window.SheetsAuth?.logout?.();
      location.replace("login.html");
    });
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
    const fl = ev.target.closest("[data-sub-flecha]");
    if (fl) {
      const barra = fl.parentElement.querySelector(".desliza");
      barra.scrollBy({ left: Number(fl.dataset.subFlecha) * barra.clientWidth * 0.7, behavior: "smooth" });
      return;
    }
    const sp = ev.target.closest("[data-sub-plan]");
    if (sp) {
      subPlan = sp.dataset.subPlan;
      pintar();
      window.scrollTo(0, 0);
      $("vista-plan").querySelector(".filtro.activo")?.scrollIntoView({ block: "nearest", inline: "center" });
      return;
    }
    const ficha = ev.target.closest("[data-ficha]");
    if (ficha) return cambiarFicha(ficha.dataset.ficha);
    if (ev.target.closest("#btnFichas")) return abrirFichas();
    const zona = ev.target.closest("[data-zona]");
    if (zona) return abrirZona(zona.dataset.zona);
    const hab = ev.target.closest("[data-habito]");
    if (hab) return abrirHabito(Number(hab.dataset.habito));
    const pen = ev.target.closest("[data-pendiente]");
    if (pen) return abrirPendiente(Number(pen.dataset.pendiente));
    if (ev.target.closest("[data-cerrar]")) cerrarHoja();
    const kpi = ev.target.closest("[data-kpi]");
    if (kpi) return abrirKpi(kpi.dataset.kpi);
    const ir = ev.target.closest("[data-ir-filtro]");
    if (ir) {
      filtroInd = ir.dataset.irFiltro;
      location.hash = "indicadores";
      return;
    }
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
    // Los puntos del cuerpo son <g role="button">: Enter y espacio tienen que abrirlos.
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.dataset?.zona) {
      ev.preventDefault();
      abrirZona(ev.target.dataset.zona);
    }
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
