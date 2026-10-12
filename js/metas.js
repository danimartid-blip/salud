// Metas diarias: lo único que la app ESCRIBE en la planilla.
//
// Pestaña "Metas": la lista de metas (la mantiene la skill).
// Pestaña "Registro": una fila por día -> fecha | ids cumplidos separados por coma.
// Una fila por día (y no una por marca) para que desmarcar sea reescribir esa
// fila, sin tener que borrar filas y correr todo lo de abajo.
//
// Este archivo se carga ANTES que app.js (que arma VISTAS con vistaMetas) y usa
// sus helpers ($, esc, D, aFecha, hoyUTC, pintar…) recién al ejecutarse.

const LETRA_DIA = ["L", "M", "M", "J", "V", "S", "D"];
const NOMBRE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const UN_DIA = 86400000;
const ymd = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const masDias = (d, n) => new Date(+d + n * UN_DIA);
const diaSemana = (d) => (d.getUTCDay() + 6) % 7; // lunes = 0
const lunesDe = (d) => masDias(d, -diaSemana(d));

let metasDia = null; // día que se está mirando/editando (AAAA-MM-DD)
let registro = null; // Map fecha -> Set(ids), armado desde D.registro
let captionCalor = "";

function reg() {
  if (registro && registro._de === D) return registro;
  registro = new Map();
  registro._de = D;
  for (const r of D.registro) {
    const f = aFecha(r.fecha);
    if (!f) continue;
    registro.set(ymd(f), new Set(String(r.cumplidas || "").split(",").map((s) => s.trim()).filter(Boolean)));
  }
  return registro;
}

const hechaEn = (id, k) => !!reg().get(k)?.has(String(id));
const hechasEn = (k) => D.metas.filter((m) => hechaEn(m.id, k)).length;
// Un día "cuenta" con el 60 % de las metas: algunas son de 2 o 5 veces por
// semana, así que pedir todas todos los días sería una racha imposible.
const umbral = () => Math.max(1, Math.ceil(D.metas.length * 0.6));
const metaSemanal = (m) => Math.max(1, Math.min(7, Number(m.meta_semanal) || 7));

function racha() {
  let d = hoyUTC();
  if (hechasEn(ymd(d)) < umbral()) d = masDias(d, -1); // hoy todavía puede lograrse
  let n = 0;
  while (hechasEn(ymd(d)) >= umbral()) {
    n++;
    d = masDias(d, -1);
  }
  return n;
}

function vecesEnSemana(m, lunes) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (hechaEn(m.id, ymd(masDias(lunes, i)))) n++;
  return n;
}

function avanceSemana() {
  const lunes = lunesDe(hoyUTC());
  let hecho = 0, total = 0;
  for (const m of D.metas) {
    total += metaSemanal(m);
    hecho += Math.min(metaSemanal(m), vecesEnSemana(m, lunes));
  }
  return total ? hecho / total : 0;
}

const ICONOS_META = {
  pan: `<path d="M5 10a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4c0 1.5-1 2-1 2v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6s-1-.5-1-2z"/>`,
  vaso: `<path d="M7 3h10l-1.5 17a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zM7.6 9h8.8"/>`,
  taza: `<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>`,
  hoja: `<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l8-8"/>`,
  fuego: `<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>`,
  luna: `<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>`,
  caminar: `<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6-2-3 1-5 4 3 3 1M11 7l-4 2-1 3M14 15l2 6"/>`,
  fuerza: `<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>`,
  reloj: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  plato: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>`,
};
const iconoMeta = (k) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS_META[norm(k)] || ICONOS_META.plato}</svg>`;

/** Anillo de avance: una sola magnitud, con su cifra al centro. */
function anilloMetas(n, total, tam = 108, grosor = 10) {
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r, f = total ? n / total : 0;
  const logrado = n >= umbral();
  return `<svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="${n} de ${total} metas">
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${grosor}"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${logrado ? "#5df2b6" : "#fff"}" stroke-width="${grosor}" stroke-linecap="round"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})" class="anillo-arco"/>
    <text x="50%" y="50%" dy="0.1em" text-anchor="middle" class="anillo-metas-num">${n}</text>
    <text x="50%" y="50%" dy="1.7em" text-anchor="middle" class="anillo-metas-sub">de ${total}</text>
  </svg>`;
}

function vistaMetas() {
  if (!D.metas.length) return `<div class="card"><p class="vacio">Todavía no hay metas cargadas.</p></div>`;
  const hoy = hoyUTC(), hoyK = ymd(hoy);
  if (!metasDia || +aFecha(metasDia) > +hoy || +aFecha(metasDia) < +masDias(hoy, -6)) metasDia = hoyK;
  const sel = metasDia, selD = aFecha(sel);
  const total = D.metas.length, n = hechasEn(sel);
  const logrado = n >= umbral();
  const r = racha(), sem = Math.round(avanceSemana() * 100);

  const tira = Array.from({ length: 7 }, (_, i) => masDias(hoy, i - 6))
    .map((d) => {
      const k = ymd(d), h = hechasEn(k), pct = Math.round((h / total) * 100);
      return `<button type="button" class="dia${k === sel ? " activo" : ""}${h >= umbral() ? " logrado" : ""}" data-meta-dia="${k}" aria-label="${NOMBRE_DIA[diaSemana(d)]} ${d.getUTCDate()}: ${h} de ${total}">
        <span>${LETRA_DIA[diaSemana(d)]}</span>
        <i style="--p:${pct}%"><b>${d.getUTCDate()}</b></i>
      </button>`;
    })
    .join("");

  const lunes = lunesDe(hoy);
  const grupos = new Map();
  for (const m of D.metas) {
    const g = m.grupo || "Metas";
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(m);
  }
  const fila = (m) => {
    const hecha = hechaEn(m.id, sel), veces = vecesEnSemana(m, lunes), ms = metaSemanal(m);
    const puntos = Array.from({ length: 7 }, (_, i) => {
      const k = ymd(masDias(lunes, i));
      return `<i class="${hechaEn(m.id, k) ? "si" : ""}${k === hoyK ? " hoy" : ""}"></i>`;
    }).join("");
    return `<div class="meta${hecha ? " hecha" : ""}">
      <button type="button" class="meta-check" data-meta-toggle="${esc(m.id)}" role="checkbox" aria-checked="${hecha}" aria-label="${esc(m.nombre)}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </button>
      <button type="button" class="meta-cuerpo" data-meta-info="${esc(m.id)}">
        <span class="meta-icono">${iconoMeta(m.icono)}</span>
        <span class="meta-txt"><strong>${esc(m.nombre)}</strong><span class="meta-puntos" aria-hidden="true">${puntos}</span></span>
        <span class="meta-sem${veces >= ms ? " ok" : ""}">${veces}/${ms}<small>semana</small></span>
      </button>
    </div>`;
  };

  // Mapa de los últimos 35 días, alineado por día de la semana.
  const inicio = masDias(lunes, -28);
  const celdas = Array.from({ length: 35 }, (_, i) => {
    const d = masDias(inicio, i), k = ymd(d);
    if (+d > +hoy) return `<i class="futuro"></i>`;
    const h = hechasEn(k), nivel = h === 0 ? 0 : Math.min(4, Math.ceil((h / total) * 4));
    return `<button type="button" class="n${nivel}${k === hoyK ? " hoy" : ""}" data-meta-calor="${k}|${h}" aria-label="${fechaLarga(d)}: ${h} de ${total}"></button>`;
  }).join("");

  return `
  <div class="metas-hero${logrado ? " logrado" : ""}">
    ${anilloMetas(n, total)}
    <div class="metas-hero-txt">
      <span class="metas-kicker">${sel === hoyK ? "Hoy" : "Editando"} · ${NOMBRE_DIA[diaSemana(selD)]} ${selD.getUTCDate()} ${MESES[selD.getUTCMonth()]}</span>
      <strong>${logrado ? "¡Día logrado!" : n === 0 ? "Parte con una" : `Te faltan ${umbral() - n} para lograr el día`}</strong>
      <div class="metas-chips">
        <span><b>${r}</b> ${r === 1 ? "día" : "días"} de racha</span>
        <span><b>${sem}%</b> de la semana</span>
      </div>
    </div>
  </div>

  <div class="dias" role="group" aria-label="Últimos 7 días">${tira}</div>

  ${[...grupos].map(([g, ms]) => `<h2>${esc(g)}</h2><div class="card lista">${ms.map(fila).join("")}</div>`).join("")}

  <h2>Últimos 35 días</h2>
  <div class="card">
    <div class="calor-cab" aria-hidden="true">${LETRA_DIA.map((l) => `<span>${l}</span>`).join("")}</div>
    <div class="calor">${celdas}</div>
    <div class="calor-pie">
      <span id="calorCaption">${esc(captionCalor) || "Toca un día para ver cuántas cumpliste."}</span>
      <span class="calor-escala" aria-hidden="true">menos <i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i> más</span>
    </div>
  </div>
  <p class="metas-nota">Un día se da por logrado con ${umbral()} de ${total} metas. Puedes corregir los últimos 7 días.</p>`;
}

function abrirMeta(id) {
  const m = D.metas.find((x) => String(x.id) === String(id));
  if (!m) return;
  const hoy = hoyUTC();
  let en30 = 0;
  const puntos = Array.from({ length: 30 }, (_, i) => {
    const si = hechaEn(m.id, ymd(masDias(hoy, i - 29)));
    if (si) en30++;
    return `<i class="${si ? "si" : ""}"></i>`;
  }).join("");
  const ms = metaSemanal(m), veces = vecesEnSemana(m, lunesDe(hoy));
  mostrarHoja(`
    <p class="det-grupo">${esc(m.grupo || "Meta")}</p>
    <h2 id="hojaTitulo">${esc(m.nombre)}</h2>
    <div class="det-valor"><span class="det-num">${veces}</span><span class="det-unidad">de ${ms} esta semana</span></div>
    <p class="det-meta">Meta: ${ms === 7 ? "todos los días" : `${ms} ${ms === 1 ? "vez" : "veces"} por semana`} · ${en30} de los últimos 30 días</p>
    <div class="meta-30" aria-hidden="true">${puntos}</div>
    ${bloqueDet("Qué cuenta como cumplido", m.como)}
    ${bloqueDet("Por qué ayuda a tu hígado", m.por_que, "det-lectura")}`);
}

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("visible"), 3200);
}

// Las escrituras van en fila, una tras otra: dos toques rápidos sobre el mismo
// día no pueden pisarse ni crear dos filas para la misma fecha.
let colaEscritura = Promise.resolve();

async function guardarDia(k) {
  if (!window.SheetsApi?.updateRange) return; // vista previa local: no escribe
  const valor = [...(reg().get(k) || [])].join(",");
  // Se busca la fila de la fecha en el momento de escribir: la planilla puede
  // haber cambiado desde que se cargó la app.
  const col = await window.SheetsApi.readRange("Registro!A2:A");
  const i = col.findIndex((f) => {
    const d = aFecha(f[0]);
    return d && ymd(d) === k;
  });
  if (i >= 0) await window.SheetsApi.updateRange(`Registro!A${i + 2}:B${i + 2}`, [[k, valor]]);
  else await window.SheetsApi.appendRow("Registro!A1", [k, valor]);
}

function alternarMeta(id) {
  const k = metasDia, mapa = reg();
  if (!mapa.has(k)) mapa.set(k, new Set());
  const set = mapa.get(k), estaba = set.has(String(id));
  estaba ? set.delete(String(id)) : set.add(String(id));
  pintar();
  colaEscritura = colaEscritura
    .then(() => guardarDia(k))
    .catch((err) => {
      console.error(err);
      // No quedó guardado: se devuelve la marca a como estaba para no mostrar algo falso.
      estaba ? set.add(String(id)) : set.delete(String(id));
      pintar();
      showToast("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    });
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-meta-toggle]");
  if (t) return alternarMeta(t.dataset.metaToggle);
  const info = ev.target.closest("[data-meta-info]");
  if (info) return abrirMeta(info.dataset.metaInfo);
  const dia = ev.target.closest("[data-meta-dia]");
  if (dia) {
    metasDia = dia.dataset.metaDia;
    return pintar();
  }
  const calor = ev.target.closest("[data-meta-calor]");
  if (calor) {
    const [k, h] = calor.dataset.metaCalor.split("|");
    captionCalor = `${fechaLarga(aFecha(k))}: ${h} de ${D.metas.length} metas`;
    const c = $("calorCaption");
    if (c) c.textContent = captionCalor;
  }
});
