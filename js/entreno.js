// Entreno: sub-pestaña de Metas con la rutina del día, lo anotado y el avance.
//
// Pestañas (todas opcionales: sin "Rutina" la sub-pestaña no aparece):
//   Rutina   dia | orden | ejercicio | series | reps | peso_kg | descanso | como | cuidado | activo
//            (la mantiene la skill; dia = A, B…; peso_kg es el sugerido por mancuerna)
//   Entrenos id | fecha | rutina | ejercicio | series | reps | peso_kg | esfuerzo | nota
//            (la escriben la app y la skill: una fila por ejercicio hecho; reps = "12,10,10")
//   Medidas  fecha | peso_kg | grasa_pct | musculo_pct | agua_pct | visceral | cintura_cm | fuente | nota
//   Equipo   item | cantidad | peso_kg | nota
// La app solo AGREGA filas a Entrenos y Medidas; nunca reescribe ni borra.
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

let subMetas = "metas"; // metas | entreno
let entDia = null; // rutina que se está mirando (A, B…)
let colaEntreno = Promise.resolve();

const COLS_ENTRENOS = ["id", "fecha", "rutina", "ejercicio", "series", "reps", "peso_kg", "esfuerzo", "nota"];
const COLS_MEDIDAS = ["fecha", "peso_kg", "grasa_pct", "musculo_pct", "agua_pct", "visceral", "cintura_cm", "fuente", "nota"];

const diasRutina = () => [...new Set(D.rutina.map((r) => String(r.dia).trim().toUpperCase()))].sort();
const ejerciciosDe = (dia) => D.rutina.filter((r) => String(r.dia).trim().toUpperCase() === dia).sort((a, b) => (num(a.orden) ?? 99) - (num(b.orden) ?? 99));
const porFecha = (a, b) => String(b.fecha).localeCompare(String(a.fecha));

/** La que toca: la siguiente a la última hecha (o la de hoy si ya empezaste). */
function rutinaQueToca() {
  const dias = diasRutina();
  const ult = [...D.entrenos].sort(porFecha)[0];
  if (!ult) return dias[0];
  const d = String(ult.rutina).trim().toUpperCase();
  if (ult.fecha === ymd(hoyUTC()) && dias.includes(d)) return d;
  const i = dias.indexOf(d);
  return dias[(i + 1) % dias.length] || dias[0];
}

/** Lo último anotado de un ejercicio (sin contar hoy). */
function ultimaVez(ejercicio) {
  const hoyK = ymd(hoyUTC());
  return D.entrenos.filter((e) => norm(e.ejercicio) === norm(ejercicio) && e.fecha !== hoyK).sort(porFecha)[0];
}
const hechoHoy = (ejercicio) => D.entrenos.find((e) => norm(e.ejercicio) === norm(ejercicio) && e.fecha === ymd(hoyUTC()));

/** Sesiones = días distintos con algo anotado. */
function sesiones() {
  const m = new Map();
  for (const e of D.entrenos) {
    if (!m.has(e.fecha)) m.set(e.fecha, []);
    m.get(e.fecha).push(e);
  }
  return [...m].sort((a, b) => b[0].localeCompare(a[0]));
}

function sesionesSemana() {
  const lunes = ymd(lunesDe(hoyUTC()));
  return sesiones().filter(([f]) => f >= lunes).length;
}

const kg = (v) => (num(v) == null ? "" : `${String(num(v)).replace(".", ",")} kg`);

function vistaEntreno() {
  const dias = diasRutina();
  if (!dias.includes(entDia)) entDia = rutinaQueToca();
  const toca = rutinaQueToca();
  const meta = num(D.perfil.meta_entrenos_semana) || 2;
  const sem = sesionesSemana();
  const ses = sesiones();
  const ejs = ejerciciosDe(entDia);
  const hechos = ejs.filter((e) => hechoHoy(e.ejercicio)).length;

  const lista = ejs
    .map((r, i) => {
      const hoy = hechoHoy(r.ejercicio);
      const u = ultimaVez(r.ejercicio);
      const objetivo = `${esc(r.series)} × ${esc(r.reps)}${num(r.peso_kg) ? ` · ${kg(r.peso_kg)}` : ""}`;
      const antes = hoy
        ? `Hoy: ${esc(hoy.reps)}${num(hoy.peso_kg) ? ` con ${kg(hoy.peso_kg)}` : ""}${hoy.esfuerzo ? ` · esfuerzo ${esc(hoy.esfuerzo)}` : ""}`
        : u
          ? `Última vez: ${esc(u.reps)}${num(u.peso_kg) ? ` con ${kg(u.peso_kg)}` : ""}${u.esfuerzo ? ` · esfuerzo ${esc(u.esfuerzo)}` : ""}`
          : "Primera vez";
      return `<div class="meta${hoy ? " hecha" : ""}">
        <button type="button" class="meta-check" data-ent-anotar="${i}" aria-label="Anotar ${esc(r.ejercicio)}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <button type="button" class="meta-cuerpo" data-ent-info="${i}">
          <span class="meta-txt"><strong>${esc(r.ejercicio)}</strong><small class="meta-auto">${objetivo}</small><small class="ent-antes">${antes}</small></span>
        </button>
      </div>`;
    })
    .join("");

  const hist = ses
    .slice(0, 6)
    .map(([f, es]) => {
      const d = aFecha(f);
      const esf = es.map((e) => num(e.esfuerzo)).filter((x) => x != null);
      const rut = [...new Set(es.map((e) => String(e.rutina).toUpperCase()).filter(Boolean))].join("+");
      return `<li><span><strong>${d ? `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` : esc(f)}</strong>${rut ? ` · Rutina ${esc(rut)}` : ""}</span>
        <span>${es.length} ejercicio${es.length === 1 ? "" : "s"}${esf.length ? ` · esfuerzo ${(esf.reduce((a, b) => a + b, 0) / esf.length).toFixed(1).replace(".", ",")}` : ""}</span></li>`;
    })
    .join("");

  return `
  <div class="metas-hero${sem >= meta ? " logrado" : ""}">
    <div class="metas-hero-txt">
      <span class="metas-kicker">Entreno · rutina ${esc(toca)}</span>
      <strong>${hechos === ejs.length && ejs.length ? "¡Rutina completa!" : hechos ? `Vas en ${hechos} de ${ejs.length}` : "Toca ✓ al terminar cada ejercicio"}</strong>
      <div class="metas-chips">
        <span><b>${sem}/${meta}</b> esta semana</span>
        <span><b>${ses.length}</b> ${ses.length === 1 ? "sesión" : "sesiones"} en total</span>
      </div>
    </div>
  </div>
  ${dias.length > 1 ? subPestanas(dias.map((d) => [d, `Rutina ${d}`, d === toca ? "toca" : ""]), entDia, "data-ent-dia") : ""}
  <div class="card lista">${lista || `<p class="vacio">Esta rutina no tiene ejercicios.</p>`}</div>
  ${medidasResumen()}
  <h2>Historial</h2>
  <div class="card">${hist ? `<ul class="ent-hist">${hist}</ul>` : `<p class="vacio">Todavía no hay entrenos anotados.</p>`}</div>
  ${D.equipo.length ? `<h2>Tu equipo</h2><div class="card"><ul class="ent-hist">${D.equipo.map((q) => `<li><span><strong>${esc(q.item)}</strong>${q.nota ? ` · <small>${esc(q.nota)}</small>` : ""}</span><span>${esc(q.cantidad)}${num(q.peso_kg) ? ` × ${kg(q.peso_kg)}` : ""}</span></li>`).join("")}</ul></div>` : ""}`;
}

function medidasResumen() {
  const ms = [...D.medidas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const ult = ms[ms.length - 1];
  // Cada dato se compara con su primera medición en la misma pesa: dos pesas distintas no se comparan.
  const mismas = ms.filter((m) => norm(m.fuente) === norm(ult?.fuente));
  const prim = mismas[0];
  const dato = (k, txt, uni, mejorSube) => {
    const v = num(ult?.[k]);
    if (v == null) return "";
    const base = mismas.find((m) => num(m[k]) != null);
    const p = base && base !== ult ? num(base[k]) : null;
    const dif = p != null ? v - p : null;
    const bien = dif == null || dif === 0 ? "" : (dif > 0) === mejorSube ? "ok" : "mal";
    return `<div class="ent-dato"><small>${txt}</small><b>${String(v).replace(".", ",")}${uni}</b>${dif ? `<span class="${bien}">${dif > 0 ? "+" : ""}${dif.toFixed(1).replace(".", ",")}${uni}</span>` : ""}</div>`;
  };
  const f = ult ? aFecha(ult.fecha) : null;
  return `<h2>Tu cuerpo</h2>
  <div class="card">
    ${ult ? `<div class="ent-datos">${dato("peso_kg", "Peso", " kg", false)}${dato("musculo_pct", "Músculo", " %", true)}${dato("grasa_pct", "Grasa", " %", false)}${dato("cintura_cm", "Cintura", " cm", false)}</div>
    <p class="resumen-nota">Última medición: ${f ? `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}` : esc(ult.fecha)}${prim && prim !== ult ? ` · cambio desde ${esc(prim.fecha.split("-").reverse().join("-"))} en la misma pesa` : ""}. La meta es que el músculo suba o se mantenga mientras baja la grasa.</p>` : `<p class="vacio">Todavía no hay medidas.</p>`}
    <button type="button" class="btn-primary diario-agregar" data-ent-medida>+ Anotar medidas de la pesa</button>
  </div>`;
}

function abrirInfo(i) {
  const r = ejerciciosDe(entDia)[i];
  if (!r) return;
  const hist = D.entrenos
    .filter((e) => norm(e.ejercicio) === norm(r.ejercicio))
    .sort(porFecha)
    .slice(0, 6)
    .map((e) => `<li><span>${esc(String(e.fecha).split("-").reverse().join("-"))}</span><span>${esc(e.reps)}${num(e.peso_kg) ? ` · ${kg(e.peso_kg)}` : ""}${e.esfuerzo ? ` · esf. ${esc(e.esfuerzo)}` : ""}</span></li>`)
    .join("");
  mostrarHoja(`
    <p class="det-grupo">Rutina ${esc(entDia)}</p>
    <h2 id="hojaTitulo">${esc(r.ejercicio)}</h2>
    <p class="ent-objetivo">${esc(r.series)} series × ${esc(r.reps)}${num(r.peso_kg) ? ` · ${kg(r.peso_kg)} por mancuerna` : ""}${r.descanso ? ` · descanso ${esc(r.descanso)}` : ""}</p>
    ${bloqueDet("Cómo se hace", r.como)}
    ${bloqueDet("Cuidado", r.cuidado, "det-lectura")}
    ${hist ? `<section class="det-bloque"><h4>Lo que has hecho</h4><ul class="ent-hist">${hist}</ul></section>` : ""}
    <button type="button" class="btn-primary" data-ent-anotar="${i}">Anotar este ejercicio</button>`);
}

function abrirAnotar(i) {
  const r = ejerciciosDe(entDia)[i];
  if (!r) return;
  const u = hechoHoy(r.ejercicio) || ultimaVez(r.ejercicio);
  const n = num(r.series) || 3;
  const reps = String(u?.reps || "").split(",");
  const peso = num(u?.peso_kg) ?? num(r.peso_kg) ?? "";
  mostrarHoja(`
    <p class="det-grupo">Rutina ${esc(entDia)} · ${esc(r.series)} × ${esc(r.reps)}</p>
    <h2 id="hojaTitulo">${esc(r.ejercicio)}</h2>
    <div class="desp-form" data-ent-form="${i}">
      <p class="alta-rompe-tit">Repeticiones de cada serie (deja vacía la que no hiciste)</p>
      <div class="alta-otro-nums">${Array.from({ length: n }, (_, k) => `<input class="buscar ent-rep" inputmode="numeric" placeholder="Serie ${k + 1}" value="${esc(reps[k] || "")}">`).join("")}</div>
      <label class="alta-rompe-tit" for="entPeso">Peso por mancuerna (kg, si usaste)</label>
      <input id="entPeso" class="buscar" inputmode="decimal" value="${String(peso).replace(".", ",")}">
      <p class="alta-rompe-tit">¿Cuánto te costó? (1 = nada, 10 = no podía más)</p>
      <div class="alta-comidas ent-esfuerzo">${[5, 6, 7, 8, 9, 10].map((x) => `<button type="button" class="filtro${x === 7 ? " activo" : ""}" data-ent-esf="${x}">${x}</button>`).join("")}</div>
      <input id="entNota" class="buscar" placeholder="Nota (opcional): dolor, técnica…" autocomplete="off">
      <button type="button" class="btn-primary" data-ent-guardar="${i}">Guardar</button>
    </div>`);
}

function guardarEjercicio(i) {
  const r = ejerciciosDe(entDia)[i];
  const reps = [...document.querySelectorAll(".ent-rep")].map((x) => x.value.trim()).filter(Boolean);
  if (!r || !reps.length) return showToast("Anota las repeticiones de al menos una serie.");
  const e = {
    id: `en${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    fecha: ymd(hoyUTC()),
    rutina: entDia,
    ejercicio: r.ejercicio,
    series: reps.length,
    reps: reps.join(","),
    peso_kg: num($("entPeso").value.replace(",", ".")) ?? "",
    esfuerzo: Number(document.querySelector("[data-ent-esf].activo")?.dataset.entEsf) || "",
    nota: $("entNota").value.trim(),
  };
  D.entrenos.push(e);
  cerrarHoja();
  pintar();
  showToast(`Anotado: ${r.ejercicio}`);
  escribir("Entrenos!A1", COLS_ENTRENOS.map((c) => e[c] ?? ""), () => (D.entrenos = D.entrenos.filter((x) => x !== e)));
  // Entrenar cuenta para la meta diaria "fuerza", si existe: se marca sola.
  if (D.metas.some((m) => m.id === "fuerza") && !hechaEn("fuerza", e.fecha)) {
    metasDia = e.fecha;
    alternarMeta("fuerza");
  }
}

function abrirMedida() {
  const campos = [["peso_kg", "Peso (kg)"], ["grasa_pct", "Grasa (%)"], ["musculo_pct", "Músculo (%)"], ["agua_pct", "Agua (%)"], ["visceral", "Grasa visceral"], ["cintura_cm", "Cintura (cm)"]];
  mostrarHoja(`
    <p class="det-grupo">Tu cuerpo</p>
    <h2 id="hojaTitulo">Medidas de hoy</h2>
    <div class="desp-form">
      <p class="alta-rompe-tit">Lo que marque la pesa. Ideal: en la mañana, en ayunas y después de ir al baño.</p>
      ${campos.map(([k, t]) => `<label class="alta-rompe-tit" for="med_${k}">${t}</label><input id="med_${k}" class="buscar" inputmode="decimal">`).join("")}
      <button type="button" class="btn-primary" data-ent-medida-guardar>Guardar</button>
    </div>`);
}

function guardarMedida() {
  const m = { fecha: ymd(hoyUTC()), fuente: "Pesa de casa (app)", nota: "" };
  for (const k of ["peso_kg", "grasa_pct", "musculo_pct", "agua_pct", "visceral", "cintura_cm"]) m[k] = num($(`med_${k}`).value.replace(",", ".")) ?? "";
  if (m.peso_kg === "") return showToast("Anota al menos el peso.");
  D.medidas.push(m);
  cerrarHoja();
  pintar();
  showToast("Medidas guardadas");
  escribir("Medidas!A1", COLS_MEDIDAS.map((c) => m[c] ?? ""), () => (D.medidas = D.medidas.filter((x) => x !== m)));
}

/** Agrega una fila al final. Si falla, se deshace en pantalla y avisa. */
function escribir(rango, fila, deshacer) {
  if (window.__DATOS_PRUEBA__) return; // vista previa local: no hay planilla
  colaEntreno = colaEntreno
    .then(() => window.SheetsApi?.appendRow && window.SheetsApi.appendRow(rango, fila))
    .catch((err) => {
      console.error(err);
      deshacer();
      pintar();
      showToast("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    });
}

/** Metas con sub-pestaña Entreno cuando la ficha tiene rutina. */
function vistaMetasYEntreno() {
  if (!D.rutina.length) return vistaMetas();
  if (!metasManuales().length) subMetas = "entreno";
  const secciones = [
    ...(metasManuales().length ? [["metas", "Metas", `${hechasEn(ymd(hoyUTC()))}/${metasManuales().length}`]] : []),
    ["entreno", "Entreno", `${sesionesSemana()}/${num(D.perfil.meta_entrenos_semana) || 2}`],
  ];
  return subPestanas(secciones, subMetas, "data-sub-metas") + (subMetas === "entreno" ? vistaEntreno() : vistaMetas());
}

document.addEventListener("click", (ev) => {
  const t = (sel) => ev.target.closest(sel);
  const sm = t("[data-sub-metas]");
  if (sm) {
    subMetas = sm.dataset.subMetas;
    pintar();
    return window.scrollTo(0, 0);
  }
  const d = t("[data-ent-dia]");
  if (d) {
    entDia = d.dataset.entDia;
    return pintar();
  }
  const g = t("[data-ent-guardar]");
  if (g) return guardarEjercicio(Number(g.dataset.entGuardar));
  const a = t("[data-ent-anotar]");
  if (a) return abrirAnotar(Number(a.dataset.entAnotar));
  const inf = t("[data-ent-info]");
  if (inf) return abrirInfo(Number(inf.dataset.entInfo));
  const es = t("[data-ent-esf]");
  if (es) return document.querySelectorAll("[data-ent-esf]").forEach((x) => x.classList.toggle("activo", x === es));
  if (t("[data-ent-medida-guardar]")) return guardarMedida();
  if (t("[data-ent-medida]")) return abrirMedida();
});
