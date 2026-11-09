// Despensa: lo que hay en la casa, por lugar, con lo que vence pronto arriba.
// Sub-pestaña "Despensa" de Nutrición.
//
// Pestaña "Despensa" (la escribe la app y también la skill):
//   id | alimento | cantidad | unidad | lugar | grupo | actualizado | nota
//   lugar: Refri | Congelador | Despensa. grupo: el de la pauta (cereal, proteico…).
//   El vencimiento va en nota como "Vence DD-MM-AAAA".
// La app nunca reescribe la pestaña: agrega filas, cambia celdas de una fila
// (buscándola por id al momento de escribir) y deja en blanco las agotadas.
// Es opcional: si la planilla no la tiene, la app la ignora (ver cargar en app.js).
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

let colaDespensa = Promise.resolve();
let buscaDespensa = "";

const LUGARES = ["Refri", "Congelador", "Despensa"];
const DIAS_AVISO = 14;

/** "Vence 20-11-2026" en la nota -> fecha UTC, o null. */
function venceDe(p) {
  const m = String(p.nota ?? "").match(/vence\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/i);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

// "No son para Daniel" en la nota: está en la casa pero no se le sugiere.
const ajeno = (p) => /no (es|son) para/i.test(String(p.nota ?? ""));
const hayDe = (p) => num(p.cantidad) == null || num(p.cantidad) > 0;
// Cuánto mueve cada toque de − y +: de a 50 en gramos y ml, de a medio en kilos y litros.
const pasoDe = (p) => {
  const u = norm(p.unidad);
  if (/^(g|gr|grs|gramos?|ml|cc)$/.test(u)) return 50;
  return /^(kg|l|lt|litros?)$/.test(u) ? 0.5 : 1;
};
// Palabras sin tildes ni plural, para cruzar "Huevos" o "Pechuga de pollo" de la
// despensa con "Huevo" o "Pollo" de Alimentos (se compara su primera palabra).
const raices = (s) =>
  norm(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zñ]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/s$/, "").replace(/e$/, ""));
const raiz = (s) => raices(s)[0] || "";

/** ¿Este alimento de la pauta está en la despensa, con algo y sin vencer? */
function enDespensa(nombre) {
  const r = raiz(nombre);
  if (!r) return false;
  const hoy = hoyUTC();
  return D.despensa.some((p) => {
    const v = venceDe(p);
    return hayDe(p) && !(v && v < hoy) && !ajeno(p) && raices(p.alimento).includes(r);
  });
}

function textoVence(d) {
  const n = diasHasta(d);
  if (n < 0) return `venció hace ${-n} ${n === -1 ? "día" : "días"}`;
  if (n === 0) return "vence hoy";
  if (n === 1) return "vence mañana";
  return `vence en ${n} días`;
}

function filaProducto(p) {
  const v = venceDe(p);
  const n = v ? diasHasta(v) : null;
  const aviso = n == null ? "" : n < 0 ? "alerta" : n <= DIAS_AVISO ? "atencion" : "";
  const extra = [GRUPOS[norm(p.grupo)], String(p.nota ?? "").trim()].filter(Boolean).join(" · ");
  return `<li class="desp-item">
    <span class="desp-nombre"><strong>${esc(p.alimento)}</strong>${extra ? `<small>${esc(extra)}</small>` : ""}${
      aviso ? `<span class="pill pill-${aviso}">${esc(textoVence(v))}</span>` : ""
    }</span>
    <span class="desp-cant">
      <button type="button" data-desp-cant="-1" data-desp-id="${esc(p.id)}" aria-label="Restar ${esc(p.alimento)}">−</button>
      <span><b>${fmt(num(p.cantidad) ?? p.cantidad)}</b> ${esc(p.unidad)}</span>
      <button type="button" data-desp-cant="1" data-desp-id="${esc(p.id)}" aria-label="Sumar ${esc(p.alimento)}">+</button>
    </span>
    <button type="button" class="desp-agotado" data-desp-agotado="${esc(p.id)}">Agotado</button>
  </li>`;
}

function vistaDespensa() {
  const hoy = hoyUTC();
  const q = norm(buscaDespensa);
  const lista = D.despensa.filter((p) => !q || norm(p.alimento).includes(q) || norm(p.nota).includes(q));

  const urgentes = D.despensa
    .map((p) => ({ p, v: venceDe(p) }))
    .filter(({ v }) => v && diasHasta(v) <= DIAS_AVISO)
    .sort((a, b) => a.v - b.v);
  const vencidos = urgentes.filter(({ v }) => v < hoy).length;

  const lugares = [...LUGARES, ...new Set(D.despensa.map((p) => p.lugar).filter((l) => l && !LUGARES.includes(l)))];
  const bloques = lugares
    .map((l) => {
      const fs = lista.filter((p) => (p.lugar || "Despensa") === l).sort((a, b) => String(a.alimento).localeCompare(String(b.alimento)));
      return fs.length ? `<h2>${esc(l)} <span class="cuenta">${fs.length}</span></h2><div class="card"><ul class="desp-lista">${fs.map(filaProducto).join("")}</ul></div>` : "";
    })
    .join("");

  return `
  ${
    urgentes.length
      ? `<div class="card desp-urgente${vencidos ? " vencido" : ""}">
      <strong>${vencidos ? `${vencidos} ${vencidos === 1 ? "producto vencido" : "productos vencidos"}` : "Vence pronto"}</strong>
      <ul>${urgentes.map(({ p, v }) => `<li><span>${esc(p.alimento)} <small>${esc(p.lugar)}</small></span><span>${esc(textoVence(v))}</span></li>`).join("")}</ul>
    </div>`
      : ""
  }
  <button type="button" class="btn-primary diario-agregar" data-desp-agregar>+ Agregar a la despensa</button>
  <input type="search" id="buscaDespensa" class="buscar" placeholder="Busca en tu despensa…" autocomplete="off" value="${esc(buscaDespensa)}">
  ${bloques || `<div class="card"><p class="vacio">${q ? "No hay nada con ese nombre." : "Tu despensa está vacía."}</p></div>`}
  <p class="familia-intro">También puedes contarle a Claude lo que compraste ("compré 12 huevos y un kilo de pollo") y lo anota aquí.</p>`;
}

// ---------- Escribir ----------

/** Fila (1-based) de un id en la pestaña, leída en el momento de escribir. */
async function filaDeId(id) {
  const ids = await window.SheetsApi.readRange("Despensa!A2:A");
  const i = ids.findIndex((r) => String(r[0] ?? "") === String(id));
  return i < 0 ? null : i + 2;
}

function enCola(tarea, deshacer, msg) {
  colaDespensa = colaDespensa
    .then(() => window.SheetsApi?.readRange && tarea())
    .catch((err) => {
      console.error(err);
      deshacer();
      pintar();
      showToast(msg);
    });
}

function cambiarCantidad(id, signo) {
  const p = D.despensa.find((x) => String(x.id) === String(id));
  if (!p) return;
  const antes = { cantidad: p.cantidad, actualizado: p.actualizado };
  const nueva = Math.max(0, redondo((num(p.cantidad) || 0) + signo * pasoDe(p)));
  p.cantidad = nueva;
  p.actualizado = ymd(hoyUTC());
  pintar();
  if (nueva === 0) showToast(`${p.alimento}: quedó en 0. Toca "Agotado" para sacarlo.`);
  // Se escribe el valor final (no la suma): si varios toques quedan en cola, gana el último.
  enCola(
    async () => {
      const r = await filaDeId(id);
      if (!r) return;
      await window.SheetsApi.updateRange(`Despensa!C${r}`, [[p.cantidad]]);
      await window.SheetsApi.updateRange(`Despensa!G${r}`, [[p.actualizado]]);
    },
    () => Object.assign(p, antes),
    "No se pudo guardar la cantidad. Revisa tu conexión."
  );
}

function marcarAgotado(id) {
  const p = D.despensa.find((x) => String(x.id) === String(id));
  if (!p || !confirm(`¿Se acabó "${p.alimento}"? Sale de la despensa.`)) return;
  D.despensa = D.despensa.filter((x) => x !== p);
  pintar();
  enCola(
    async () => {
      const r = await filaDeId(id);
      if (r) await window.SheetsApi.updateRange(`Despensa!A${r}:H${r}`, [Array(8).fill("")]);
    },
    () => D.despensa.push(p),
    "No se pudo sacar. Revisa tu conexión."
  );
}

function abrirAltaDespensa() {
  const sugerencias = D.alimentos.map((a) => `<option value="${esc(a.nombre)}"></option>`).join("");
  mostrarHoja(`
    <p class="det-grupo">Despensa</p>
    <h2 id="hojaTitulo">¿Qué agregas?</h2>
    <div class="desp-form">
      <input id="despAlimento" class="buscar" list="despSugerencias" placeholder="Alimento (ej. Huevos)" autocomplete="off">
      <datalist id="despSugerencias">${sugerencias}</datalist>
      <div class="alta-otro-nums">
        <input id="despCantidad" class="buscar" inputmode="decimal" placeholder="Cantidad" value="1">
        <input id="despUnidad" class="buscar" placeholder="Unidad (un, kg, paquete…)" value="un">
      </div>
      <p class="alta-rompe-tit">¿Dónde está?</p>
      <div class="alta-comidas">${LUGARES.map((l, i) => `<button type="button" class="filtro${i === 0 ? " activo" : ""}" data-desp-lugar="${l}">${l}</button>`).join("")}</div>
      <label class="alta-rompe-tit" for="despGrupo">Grupo de la pauta</label>
      <select id="despGrupo" class="buscar"><option value="">Sin grupo</option>${Object.entries(GRUPOS)
        .map(([k, t]) => `<option value="${k}">${esc(t)}</option>`)
        .join("")}</select>
      <label class="alta-rompe-tit" for="despVence">Vence (opcional)</label>
      <input id="despVence" class="buscar" type="date">
      <button type="button" class="btn-primary" data-desp-guardar>Guardar</button>
    </div>`);
}

function guardarProducto() {
  const alimento = $("despAlimento").value.trim();
  const cantidad = num($("despCantidad").value.replace(",", "."));
  if (!alimento || cantidad == null) return showToast("Escribe el alimento y la cantidad.");
  const v = $("despVence").value; // AAAA-MM-DD
  const p = {
    id: `dp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    alimento,
    cantidad,
    unidad: $("despUnidad").value.trim(),
    lugar: document.querySelector("[data-desp-lugar].activo")?.dataset.despLugar || "Despensa",
    grupo: $("despGrupo").value,
    actualizado: ymd(hoyUTC()),
    nota: v ? `Vence ${v.split("-").reverse().join("-")}` : "",
  };
  D.despensa.push(p);
  cerrarHoja();
  pintar();
  showToast(`Agregado: ${alimento}`);
  const orden = ["id", "alimento", "cantidad", "unidad", "lugar", "grupo", "actualizado", "nota"];
  enCola(
    () => window.SheetsApi.appendRow("Despensa!A1", orden.map((c) => p[c] ?? "")),
    () => (D.despensa = D.despensa.filter((x) => x !== p)),
    "No se pudo guardar. Revisa tu conexión y vuelve a intentar."
  );
}

document.addEventListener("click", (ev) => {
  const t = (sel) => ev.target.closest(sel);
  if (t("[data-desp-agregar]")) return abrirAltaDespensa();
  if (t("[data-desp-guardar]")) return guardarProducto();
  const c = t("[data-desp-cant]");
  if (c) return cambiarCantidad(c.dataset.despId, Number(c.dataset.despCant));
  const a = t("[data-desp-agotado]");
  if (a) return marcarAgotado(a.dataset.despAgotado);
  const l = t("[data-desp-lugar]");
  if (l) document.querySelectorAll("[data-desp-lugar]").forEach((x) => x.classList.toggle("activo", x === l));
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "despAlimento") {
    // Si eligió un alimento de la lista, se completa su grupo.
    const a = D.alimentos.find((x) => norm(x.nombre) === norm(ev.target.value));
    if (a && $("despGrupo")) $("despGrupo").value = norm(a.grupo);
  }
  if (ev.target.id !== "buscaDespensa") return;
  buscaDespensa = ev.target.value;
  const pos = ev.target.selectionStart;
  pintar();
  const nuevo = $("buscaDespensa");
  nuevo.focus();
  nuevo.setSelectionRange(pos, pos);
});
