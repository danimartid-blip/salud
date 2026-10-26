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

  return `
  <h2>Conclusiones</h2>
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
  }

  ${
    D.familia.length
      ? `<h2>Preguntas para la familia <span class="cuenta">${sinResponder.length} sin responder</span></h2>
         <p class="familia-intro">Cosas que no están en los papeles. Lo que respondan aquí queda guardado en la ficha y sirve para sacar mejores conclusiones.</p>
         ${sinResponder.map(tarjetaFamilia).join("")}
         ${respondidas.length ? `<details class="card plegable"${editandoFamilia && respondidas.some((f) => String(f.id) === editandoFamilia) ? " open" : ""}><summary>Ya respondidas (${respondidas.length})</summary>${respondidas.map(tarjetaFamilia).join("")}</details>` : ""}`
      : ""
  }

  <h2>Preguntas para los médicos</h2>
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
