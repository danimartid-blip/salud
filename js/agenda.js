// Marcar pendientes como hechos desde la app (y deshacerlo).
//
// Escribe en la pestaña Agenda la fila completa del pendiente: estado "Hecho" o
// "Pendiente" y, si no tenía fecha, la fecha del día en que se marcó, para que
// quede en el historial de "Ya hecho".
//
// Se carga después de metas.js (usa ymd y showToast) y antes de app.js; usa los
// helpers de app.js recién al ejecutarse.

let colaAgenda = Promise.resolve();

const fechaDeFila = (v) => {
  const d = aFecha(v);
  return d ? ymd(d) : "";
};

/** Busca la fila del pendiente en el momento de escribir, por título y fecha
 * originales: la planilla puede haber cambiado desde que se cargó la app (la
 * skill reordena o agrega pendientes), así que nunca se confía en un número de
 * fila guardado. */
async function guardarPendiente(a, fechaOriginal) {
  if (!window.SheetsApi?.updateRange) return; // vista previa local: no escribe
  const filas = await window.SheetsApi.readRange("Agenda!A2:E");
  const i = filas.findIndex(
    (f) => String(f[2] ?? "").trim() === String(a.titulo).trim() && fechaDeFila(f[0]) === fechaOriginal
  );
  if (i < 0) throw new Error("No encontré ese pendiente en la planilla. Toca actualizar y vuelve a intentar.");
  await window.SheetsApi.updateRange(`Agenda!A${i + 2}:E${i + 2}`, [[a.fecha, a.tipo, a.titulo, a.detalle, a.estado]]);
}

function alternarPendiente(i) {
  const a = D.agenda[i];
  if (!a) return;
  const antes = { estado: a.estado, fecha: a.fecha, _fecha: a._fecha };
  const fechaOriginal = a._fecha ? ymd(a._fecha) : "";
  const estabaHecho = norm(a.estado) === "hecho";

  a.estado = estabaHecho ? "Pendiente" : "Hecho";
  if (!estabaHecho && !a._fecha) {
    a._fecha = hoyUTC();
    a.fecha = ymd(a._fecha);
  }
  cerrarHoja();
  pintar();
  showToast(estabaHecho ? "Volvió a pendientes" : "¡Listo! Marcado como hecho");

  colaAgenda = colaAgenda
    .then(() => guardarPendiente(a, fechaOriginal))
    .catch((err) => {
      console.error(err);
      // No quedó guardado: se devuelve a como estaba para no mostrar algo falso.
      Object.assign(a, antes);
      pintar();
      showToast(err.message.startsWith("No encontré") ? err.message : "No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    });
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-agenda-toggle]");
  if (t) alternarPendiente(Number(t.dataset.agendaToggle));
});
