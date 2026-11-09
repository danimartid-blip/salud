// Pauta de alimentación: la que entregó la nutricionista, para seguirla día a día.
// Vive como sub-pestaña "Pauta" de Nutrición.
//
// Pestaña "Pauta" (la mantiene la skill): seccion | orden | titulo | hora | detalle
//   seccion: comida | lista | evitar | consejo
//   detalle: una línea por ítem. En las comidas, "(Lista N)" se vuelve un botón
//   que abre esa lista de intercambio. En las listas, cada línea es
//   "Alimento = porción".
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.


const lineas = (t) => String(t ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
const deSeccion = (s) => D.pauta.filter((p) => norm(p.seccion) === s).sort((a, b) => (num(a.orden) ?? 999) - (num(b.orden) ?? 999));

/** Minutos desde medianoche de "8:30" o "13:30". */
function minutosDe(hora) {
  const m = String(hora ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** La comida que toca ahora: la última cuya hora ya pasó (o la primera del día). */
function comidaActual(comidas) {
  const h = new Date(), ahora = h.getHours() * 60 + h.getMinutes();
  const conHora = comidas.filter((c) => minutosDe(c.hora) != null);
  if (!conHora.length) return null;
  let actual = null;
  for (const c of conHora) if (minutosDe(c.hora) <= ahora + 30) actual = c; // 30 min antes ya "toca"
  return actual || conHora[0];
}

function conListas(texto) {
  return esc(texto).replace(/\(?Lista (\d+)\)?/g, (_, n) => `<button type="button" class="chip-lista" data-lista="${n}">Lista ${n}</button>`);
}

function vistaPauta() {
  const comidas = deSeccion("comida");
  const actual = comidaActual(comidas);
  const tarjeta = (c) => `<div class="card comida${c === actual ? " ahora" : ""}">
      <div class="comida-cab">
        ${c.hora ? `<span class="comida-hora">${esc(c.hora)}</span>` : ""}
        <strong>${esc(c.titulo)}</strong>
        ${c === actual ? `<span class="pill pill-ok">Ahora</span>` : ""}
      </div>
      <ul class="comida-lista">${lineas(c.detalle).map((l) => `<li>${conListas(l)}</li>`).join("")}</ul>
    </div>`;

  const listas = deSeccion("lista");
  const evitar = deSeccion("evitar");
  const consejos = deSeccion("consejo");

  return `
    <p class="familia-intro">La pauta de tu nutricionista. Toca una lista para ver qué puedes elegir y cuánto es una porción.</p>
    ${comidas.map(tarjeta).join("")}
    ${
      listas.length
        ? `<h2>Listas de intercambio</h2>${listas
            .map((l) => `<button type="button" class="card fila-lista" data-lista="${esc(String(l.orden))}"><span>${esc(l.titulo)}</span><span aria-hidden="true">›</span></button>`)
            .join("")}`
        : ""
    }
    ${evitar.map((e) => `<h2>${esc(e.titulo)}</h2><div class="card evitar"><ul>${lineas(e.detalle).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("")}
    ${consejos.length ? `<h2>Para acompañar la pauta</h2>${consejos.map((c) => `<details class="card plegable"><summary>${esc(c.titulo)}</summary><p class="consejo">${esc(c.detalle)}</p></details>`).join("")}` : ""}`;
}

function abrirLista(n) {
  const l = deSeccion("lista").find((x) => String(x.orden) === String(n));
  if (!l) return;
  const filas = lineas(l.detalle)
    .map((linea) => {
      const [alimento, porcion] = linea.split("=").map((s) => s.trim());
      return `<tr><td>${esc(alimento)}</td><td class="n">${esc(porcion || "")}</td></tr>`;
    })
    .join("");
  mostrarHoja(`
    <p class="det-grupo">Lista de intercambio</p>
    <h2 id="hojaTitulo">${esc(l.titulo)}</h2>
    ${l.hora ? `<p class="det-meta">${esc(l.hora)}</p>` : ""}
    <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Alimento</th><th class="n">1 porción</th></tr></thead><tbody>${filas}</tbody></table></div>`);
}

document.addEventListener("click", (ev) => {
  const li = ev.target.closest("[data-lista]");
  if (li) abrirLista(li.dataset.lista);
});
