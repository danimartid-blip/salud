// Revisión: conclusiones y preguntas, para las fichas que no tienen metas diarias
// (por ejemplo, las de los abuelos). Ocupa el lugar de la pestaña Metas.
//
// Pestaña "Conclusiones": la mantiene la skill (orden | titulo | nivel | texto).
// Pestaña "Familia": preguntas que solo la familia puede responder. La skill
// escribe la pregunta; la app escribe respuesta, respondido_por y fecha.
//
// Se carga después de agenda.js y antes de app.js; usa sus helpers recién al ejecutarse.

let colaFamilia = Promise.resolve();
let editandoFamilia = null; // id de la pregunta que se está respondiendo
let subRevision = "conclusiones"; // sección visible: conclusiones | familia | medicos
let avisosFamilia = []; // [{ id, nombre, n }] respuestas nuevas en otras fichas

// Si se llegó desde el aviso del inicio, se abre directo en "Familia".
try {
  if (sessionStorage.getItem("salud_ir") === "familia") subRevision = "familia";
  sessionStorage.removeItem("salud_ir");
} catch {}

// ---------- Aviso de respuestas nuevas ----------
//
// Desde la ficha propia, la app mira la pestaña Familia de cada ficha de
// `otros_perfiles` y cuenta las respuestas escritas por otra persona que este
// celular todavía no ha visto. "Visto" se guarda en localStorage
// (`salud_familia_vista`: { idPlanilla: [claves] }) al abrir la sección Familia
// de esa ficha. La clave incluye el texto, así que editar una respuesta vuelve
// a avisar.

const claveRespuesta = (id, respuesta) => `${id}|${String(respuesta).trim()}`;

function vistas() {
  try {
    return JSON.parse(localStorage.getItem("salud_familia_vista") || "{}");
  } catch {
    return {};
  }
}

function marcarVistas() {
  const todas = vistas();
  todas[window.APP_CONFIG.SPREADSHEET_ID] = D.familia
    .filter((f) => String(f.respuesta ?? "").trim())
    .map((f) => claveRespuesta(f.id, f.respuesta));
  try {
    localStorage.setItem("salud_familia_vista", JSON.stringify(todas));
  } catch {}
}

async function buscarRespuestasNuevas() {
  if (window.APP_CONFIG.VIENDO_OTRA || !window.SheetsApi?.readRangeDe) return;
  const { propia, lista } = otrasFichas();
  const vistasYa = vistas();
  const avisos = [];
  for (const { nombre, id } of lista) {
    try {
      const filas = await window.SheetsApi.readRangeDe(id, "Familia!A2:G");
      const ya = new Set(vistasYa[id] || []);
      const n = filas.filter(
        (f) => String(f[4] ?? "").trim() && String(f[5] ?? "").trim() !== propia && !ya.has(claveRespuesta(f[0], f[4]))
      ).length;
      if (n) avisos.push({ id, nombre, n });
    } catch (err) {
      console.warn("No se pudo revisar", nombre, err.message); // sin acceso o sin pestaña: se ignora
    }
  }
  avisosFamilia = avisos;
  if (avisos.length && location.hash.slice(1) !== "metas") pintar();
}

function avisoFamilia() {
  if (!avisosFamilia.length) return "";
  return `<div class="card aviso-familia">
    <strong>Respuestas nuevas de la familia</strong>
    ${avisosFamilia
      .map(
        (a) => `<button type="button" class="aviso-familia-item" data-ir-familia="${esc(a.id)}">
          <span>${esc(a.nombre)}</span><span class="sub-cuenta">${a.n} nueva${a.n > 1 ? "s" : ""}</span><span aria-hidden="true">›</span>
        </button>`
      )
      .join("")}
  </div>`;
}

const usaRevision = () => !D.metas.length && (D.conclusiones.length > 0 || D.familia.length > 0);

function tarjetaFamilia(f) {
  const resp = String(f.respuesta ?? "").trim();
  const editando = editandoFamilia === String(f.id);
  const meta = [f.respondido_por, f._fecha ? fechaLarga(f._fecha) : ""].filter(Boolean).join(" · ");
  return `<div class="card familia${resp ? " respondida" : ""}">
    <p class="familia-pregunta">${esc(f.pregunta)}</p>
    ${f.por_que ? `<p class="familia-porque">${esc(f.por_que)}</p>` : ""}
    ${
      editando
        ? `<textarea class="familia-texto" id="familiaTexto" rows="3" placeholder="Escribe lo que sepas, aunque sea aproximado">${esc(resp)}</textarea>
           <div class="familia-acciones">
             <button type="button" class="btn-primary" data-familia-guardar="${esc(f.id)}">Guardar</button>
             <button type="button" class="btn-texto" data-familia-cancelar>Cancelar</button>
           </div>`
        : resp
          ? `<div class="familia-respuesta"><p>${esc(resp)}</p>${meta ? `<small>${esc(meta)}</small>` : ""}</div>
             <button type="button" class="btn-texto" data-familia-editar="${esc(f.id)}">Editar respuesta</button>`
          : `<button type="button" class="btn-primary" data-familia-editar="${esc(f.id)}">Responder</button>`
    }
  </div>`;
}

function vistaRevision() {
  const porMedico = new Map();
  for (const p of D.preguntas.filter((p) => norm(p.estado) !== "resuelta")) {
    if (!porMedico.has(p.para)) porMedico.set(p.para, []);
    porMedico.get(p.para).push(p);
  }
  const sinResponder = D.familia.filter((f) => !String(f.respuesta ?? "").trim());
  const respondidas = D.familia.filter((f) => String(f.respuesta ?? "").trim());
  const conclusiones = [...D.conclusiones].sort((a, b) => (num(a.orden) ?? 999) - (num(b.orden) ?? 999));

  const totalMedicos = [...porMedico.values()].reduce((n, ps) => n + ps.length, 0);
  const secciones = [
    ["conclusiones", "Resumen", conclusiones.length],
    ...(D.familia.length ? [["familia", "Familia", sinResponder.length]] : []),
    ["medicos", "Médicos", totalMedicos],
  ];
  if (!secciones.some(([id]) => id === subRevision)) subRevision = "conclusiones";
  const botones = subPestanas(secciones, subRevision, "data-sub-revision");

  if (subRevision === "conclusiones") return `${botones}
  ${
    conclusiones
      .map((c) => {
        const cls = nivelDe(c.nivel);
        return `<div class="card conclusion conclusion-${cls}">
          <div class="conclusion-cab"><strong>${esc(c.titulo)}</strong>${pill(cls, NIVEL_TXT[cls])}</div>
          <p>${esc(c.texto)}</p>
        </div>`;
      })
      .join("") || `<div class="card"><p class="vacio">Todavía no hay conclusiones.</p></div>`
  }`;

  if (subRevision === "familia") marcarVistas();
  if (subRevision === "familia") return `${botones}
  <p class="familia-intro">Cosas que no están en los papeles. Lo que respondan aquí queda guardado en la ficha y sirve para sacar mejores conclusiones.</p>
  ${sinResponder.map(tarjetaFamilia).join("") || `<div class="card"><p class="vacio">¡Todas respondidas, gracias!</p></div>`}
  ${respondidas.length ? `<details class="card plegable"${editandoFamilia && respondidas.some((f) => String(f.id) === editandoFamilia) ? " open" : ""}><summary>Ya respondidas (${respondidas.length})</summary>${respondidas.map(tarjetaFamilia).join("")}</details>` : ""}`;

  return `${botones}
  ${
    [...porMedico]
      .map(([m, ps]) => `<div class="card preguntas"><h3>${esc(m)}</h3><ul>${ps.map((p) => `<li>${esc(p.pregunta)}</li>`).join("")}</ul></div>`)
      .join("") || `<div class="card"><p class="vacio">Sin preguntas pendientes.</p></div>`
  }`;
}

/** Busca la fila por id en el momento de escribir y reescribe solo la respuesta
 * (columnas E a G), sin tocar la pregunta que escribió la skill. */
async function guardarRespuesta(f) {
  if (!window.SheetsApi?.updateRange) return; // vista previa local: no escribe
  const filas = await window.SheetsApi.readRange("Familia!A2:A");
  const i = filas.findIndex((r) => String(r[0] ?? "").trim() === String(f.id).trim());
  if (i < 0) throw new Error("No encontré esa pregunta en la planilla. Toca actualizar y vuelve a intentar.");
  await window.SheetsApi.updateRange(`Familia!E${i + 2}:G${i + 2}`, [[f.respuesta, f.respondido_por, f.fecha]]);
}

function guardarFamilia(id) {
  const f = D.familia.find((x) => String(x.id) === id);
  const texto = $("familiaTexto")?.value.trim() ?? "";
  if (!f) return;
  const antes = { respuesta: f.respuesta, respondido_por: f.respondido_por, fecha: f.fecha, _fecha: f._fecha };
  f.respuesta = texto;
  f.respondido_por = texto ? otrasFichas().propia : "";
  f._fecha = texto ? hoyUTC() : null;
  f.fecha = texto ? ymd(f._fecha) : "";
  editandoFamilia = null;
  pintar();
  showToast(texto ? "¡Gracias! Respuesta guardada" : "Respuesta borrada");

  colaFamilia = colaFamilia
    .then(() => guardarRespuesta(f))
    .catch((err) => {
      console.error(err);
      Object.assign(f, antes);
      pintar();
      showToast(
        err.message.startsWith("No encontré")
          ? err.message
          : /Sheets API 403/.test(err.message)
            ? "Tu cuenta solo puede ver esta ficha. Pide acceso de editor para poder responder."
            : "No se pudo guardar. Revisa tu conexión y vuelve a intentar."
      );
    });
}

document.addEventListener("click", (ev) => {
  const ir = ev.target.closest("[data-ir-familia]");
  if (ir) {
    try {
      sessionStorage.setItem("salud_ver", ir.dataset.irFamilia);
      sessionStorage.setItem("salud_ir", "familia");
    } catch {}
    location.hash = "metas";
    location.reload();
    return;
  }
  const sub = ev.target.closest("[data-sub-revision]");
  if (sub) {
    subRevision = sub.dataset.subRevision;
    editandoFamilia = null;
    pintar();
    window.scrollTo(0, 0);
    return;
  }
  const ed = ev.target.closest("[data-familia-editar]");
  if (ed) {
    editandoFamilia = ed.dataset.familiaEditar;
    pintar();
    $("familiaTexto")?.focus();
    return;
  }
  if (ev.target.closest("[data-familia-cancelar]")) {
    editandoFamilia = null;
    return pintar();
  }
  const g = ev.target.closest("[data-familia-guardar]");
  if (g) guardarFamilia(g.dataset.familiaGuardar);
});
