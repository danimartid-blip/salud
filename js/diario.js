// Diario de comidas: anotar lo que se come y ver el total del día contra la pauta.
// Sub-pestaña "Diario" dentro de Metas.
//
// Pestaña "Alimentos" (la mantiene la skill): nombre | grupo | porcion | kcal | proteina_g | fodmap
//   Cada fila es UNA porción del sistema de intercambio. grupo: cereal, proteico,
//   lacteo, fruta, verdura_a, verdura_b, grasa, aceite, libre, extra.
// Pestaña "Comidas" (la escribe la app, y también la skill cuando se le cuenta una
//   comida en el chat): id | fecha | hora | comida | alimento | grupo | porciones | kcal | proteina_g | nota
// Perfil: meta_kcal (número) y meta_porciones ("cereal=4; proteico=4; …").
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

let colaComidas = Promise.resolve();
let diarioDia = null; // AAAA-MM-DD que se está mirando
let altaSel = null; // alimento elegido en la hoja de agregar
let altaCant = 1;

const GRUPOS = {
  cereal: "Cereales",
  proteico: "Proteínas",
  lacteo: "Lácteos",
  fruta: "Frutas",
  verdura_a: "Verduras A",
  verdura_b: "Verduras B",
  grasa: "Grasas",
  aceite: "Aceite",
  libre: "Libre",
  extra: "Fuera de pauta",
};

const COMIDAS_DIA = [
  ["Desayuno", 0],
  ["Almuerzo", 12 * 60],
  ["Colación", 16 * 60],
  ["Cena", 19 * 60],
];

function comidaPorHora(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  let c = COMIDAS_DIA[0][0];
  for (const [nombre, desde] of COMIDAS_DIA) if (m >= desde) c = nombre;
  return c;
}

function metaPorciones() {
  const out = {};
  for (const par of String(D.perfil.meta_porciones || "").split(/[;\n]+/)) {
    const [g, n] = par.split("=").map((s) => s.trim());
    if (g && num(n) != null) out[norm(g)] = num(n);
  }
  return out;
}

const delDia = (k) => D.comidas.filter((c) => c.fecha === k);
const suma = (filas, campo) => filas.reduce((s, f) => s + (num(f[campo]) || 0), 0);
const redondo = (n) => Math.round(n * 10) / 10;

function vistaDiario() {
  const hoyK = ymd(hoyUTC());
  if (!diarioDia) diarioDia = hoyK;
  const k = diarioDia;
  const filas = delDia(k);
  const kcal = Math.round(suma(filas, "kcal"));
  const prot = Math.round(suma(filas, "proteina_g"));
  const metaK = num(D.perfil.meta_kcal);
  const metas = metaPorciones();
  const pct = metaK ? Math.min(100, Math.round((kcal / metaK) * 100)) : 0;
  const pasado = metaK && kcal > metaK;

  const usadas = {};
  for (const f of filas) usadas[norm(f.grupo)] = (usadas[norm(f.grupo)] || 0) + (num(f.porciones) || 0);

  const barras = Object.entries(metas)
    .map(([g, meta]) => {
      const u = redondo(usadas[g] || 0);
      const cls = u > meta ? "sobre" : u >= meta ? "listo" : "";
      return `<div class="porc ${cls}"><span>${esc(GRUPOS[g] || g)}</span><span class="porc-num">${fmt(u)} / ${fmt(meta)}</span>
        <i style="width:${Math.min(100, (u / meta) * 100).toFixed(0)}%"></i></div>`;
    })
    .join("");

  // Alternativas: para lo que falta, ejemplos de la lista (primero los bajos en FODMAP).
  const faltan = Object.entries(metas).filter(([g, meta]) => (usadas[g] || 0) < meta && !["aceite", "libre"].includes(g));
  const alternativas = faltan
    .map(([g, meta]) => {
      const ops = D.alimentos
        .filter((a) => norm(a.grupo) === g)
        .sort((a, b) => (norm(a.fodmap) === "bajo" ? 0 : 1) - (norm(b.fodmap) === "bajo" ? 0 : 1))
        .slice(0, 4);
      if (!ops.length) return "";
      const n = redondo(meta - (usadas[g] || 0));
      return `<li><strong>${fmt(n)} ${esc(GRUPOS[g] || g)}:</strong> ${ops.map((a) => `${esc(a.nombre)} (${esc(a.porcion)})`).join(" · ")}</li>`;
    })
    .join("");

  const porComida = new Map();
  for (const f of filas) {
    const c = f.comida || "Otra";
    if (!porComida.has(c)) porComida.set(c, []);
    porComida.get(c).push(f);
  }

  const dias = Array.from({ length: 7 }, (_, i) => masDias(hoyUTC(), i - 6)).map((d) => {
    const dk = ymd(d), t = Math.round(suma(delDia(dk), "kcal"));
    return `<button type="button" class="dia${dk === k ? " activo" : ""}" data-diario-dia="${dk}"><span>${LETRA_DIA[diaSemana(d)]}</span><b>${d.getUTCDate()}</b><small>${t || "·"}</small></button>`;
  });

  return `
  <div class="card diario-total${pasado ? " pasado" : ""}">
    <div class="diario-cifra"><b>${kcal.toLocaleString("es-CL")}</b> kcal${metaK ? ` <span>de ${metaK.toLocaleString("es-CL")}</span>` : ""}</div>
    ${metaK ? `<div class="diario-barra"><i style="width:${pct}%"></i></div>` : ""}
    <p>${prot} g de proteína${metaK ? ` · ${pasado ? `te pasaste por ${(kcal - metaK).toLocaleString("es-CL")} kcal` : `te quedan ${(metaK - kcal).toLocaleString("es-CL")} kcal`}` : ""}</p>
  </div>
  <div class="dias diario-dias">${dias.join("")}</div>
  <button type="button" class="btn-primary diario-agregar" data-diario-agregar>+ Agregar lo que comí</button>
  ${barras ? `<h2>Porciones de la pauta</h2><div class="card porciones">${barras}</div>` : ""}
  ${k === hoyK && alternativas ? `<h2>Lo que te falta hoy</h2><div class="card"><ul class="alternativas">${alternativas}</ul></div>` : ""}
  <h2>${k === hoyK ? "Hoy comiste" : "Ese día comiste"}</h2>
  ${
    [...porComida]
      .map(
        ([c, fs]) => `<div class="card diario-comida"><div class="diario-comida-cab"><strong>${esc(c)}</strong><span>${Math.round(suma(fs, "kcal"))} kcal</span></div>
        <ul>${fs
          .map(
            (f) => `<li><span>${esc(f.alimento)}${num(f.porciones) && norm(f.grupo) !== "extra" && norm(f.grupo) !== "libre" ? ` <small>${fmt(num(f.porciones))} ${esc(GRUPOS[norm(f.grupo)] || "")}</small>` : ""}${f.nota ? `<small class="nota">${esc(f.nota)}</small>` : ""}</span>
            <span class="diario-kcal">${Math.round(num(f.kcal) || 0)}</span>
            <button type="button" class="diario-borrar" data-diario-borrar="${esc(f.id)}" aria-label="Borrar ${esc(f.alimento)}">×</button></li>`
          )
          .join("")}</ul></div>`
      )
      .join("") || `<div class="card"><p class="vacio">Todavía no anotas nada este día.</p></div>`
  }
  <p class="familia-intro">También puedes contarle a Claude lo que comiste ("me comí una hallulla y 3 huevos") y lo anota aquí con su cálculo.</p>`;
}

// ---------- Agregar ----------

function resultadosAlimento(q) {
  const n = norm(q);
  const lista = D.alimentos.filter((a) => !n || norm(a.nombre).includes(n)).slice(0, 30);
  return (
    lista
      .map(
        (a, i) => `<button type="button" class="fila-alimento${altaSel === a ? " sel" : ""}" data-alimento="${D.alimentos.indexOf(a)}">
        <span><strong>${esc(a.nombre)}</strong><small>${esc(a.porcion)} · ${esc(GRUPOS[norm(a.grupo)] || "")}${norm(a.fodmap) === "alto" ? " · alto en FODMAP" : ""}</small></span>
        <span>${Math.round(num(a.kcal) || 0)} kcal</span></button>`
      )
      .join("") || `<p class="vacio">No está en la lista. Usa "Otro alimento".</p>`
  );
}

function pintarAlta() {
  const a = altaSel;
  const total = a ? Math.round((num(a.kcal) || 0) * altaCant) : 0;
  $("altaDetalle").innerHTML = a
    ? `<div class="alta-sel"><strong>${esc(a.nombre)}</strong><small>1 porción = ${esc(a.porcion)}</small></div>
       <div class="alta-cant">
         <button type="button" data-alta-cant="-0.5" aria-label="Menos">−</button>
         <span><b>${fmt(altaCant)}</b> ${altaCant === 1 ? "porción" : "porciones"}</span>
         <button type="button" data-alta-cant="0.5" aria-label="Más">+</button>
       </div>
       <p class="alta-total">${total} kcal · ${Math.round((num(a.proteina_g) || 0) * altaCant)} g de proteína</p>
       <button type="button" class="btn-primary" data-alta-guardar>Guardar</button>`
    : "";
}

function abrirAlta() {
  altaSel = null;
  altaCant = 1;
  const actual = comidaPorHora();
  mostrarHoja(`
    <p class="det-grupo">Diario</p>
    <h2 id="hojaTitulo">¿Qué comiste?</h2>
    <div class="alta-comidas">${COMIDAS_DIA.map(([c]) => `<button type="button" class="filtro${c === actual ? " activo" : ""}" data-alta-comida="${c}">${c}</button>`).join("")}</div>
    <input type="search" id="buscaAlimento" class="buscar" placeholder="Busca: huevo, pan, manzana…" autocomplete="off">
    <div id="altaDetalle"></div>
    <div id="altaResultados" class="alta-resultados">${resultadosAlimento("")}</div>
    <details class="card plegable alta-otro"><summary>Otro alimento (escribir a mano)</summary>
      <input id="otroNombre" class="buscar" placeholder="Nombre y cantidad">
      <div class="alta-otro-nums"><input id="otroKcal" class="buscar" inputmode="numeric" placeholder="kcal"><input id="otroProt" class="buscar" inputmode="numeric" placeholder="proteína (g)"></div>
      <button type="button" class="btn-primary" data-alta-otro>Guardar</button>
    </details>`);
}

const comidaElegida = () => document.querySelector("[data-alta-comida].activo")?.dataset.altaComida || comidaPorHora();

function guardarComida(fila) {
  const k = diarioDia || ymd(hoyUTC());
  const ahora = new Date();
  const f = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    fecha: k,
    hora: `${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2, "0")}`,
    comida: comidaElegida(),
    ...fila,
  };
  D.comidas.push(f);
  cerrarHoja();
  pintar();
  showToast(`Anotado: ${Math.round(num(f.kcal) || 0)} kcal`);
  const orden = ["id", "fecha", "hora", "comida", "alimento", "grupo", "porciones", "kcal", "proteina_g", "nota"];
  colaComidas = colaComidas
    .then(() => window.SheetsApi?.appendRow && window.SheetsApi.appendRow("Comidas!A1", orden.map((c) => f[c] ?? "")))
    .catch((err) => {
      console.error(err);
      D.comidas = D.comidas.filter((x) => x !== f);
      pintar();
      showToast("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    });
}

/** Borra la fila buscándola por id en el momento de escribir (la deja en blanco). */
function borrarComida(id) {
  const f = D.comidas.find((x) => String(x.id) === String(id));
  if (!f || !confirm(`¿Borrar "${f.alimento}"?`)) return;
  D.comidas = D.comidas.filter((x) => x !== f);
  pintar();
  colaComidas = colaComidas
    .then(async () => {
      if (!window.SheetsApi?.readRange) return;
      const ids = await window.SheetsApi.readRange("Comidas!A2:A");
      const i = ids.findIndex((r) => String(r[0] ?? "") === String(id));
      if (i < 0) return;
      await window.SheetsApi.updateRange(`Comidas!A${i + 2}:J${i + 2}`, [Array(10).fill("")]);
    })
    .catch((err) => {
      console.error(err);
      D.comidas.push(f);
      pintar();
      showToast("No se pudo borrar. Revisa tu conexión y vuelve a intentar.");
    });
}

document.addEventListener("click", (ev) => {
  const t = (sel) => ev.target.closest(sel);
  if (t("[data-diario-agregar]")) return abrirAlta();
  const dd = t("[data-diario-dia]");
  if (dd) {
    diarioDia = dd.dataset.diarioDia;
    return pintar();
  }
  const b = t("[data-diario-borrar]");
  if (b) return borrarComida(b.dataset.diarioBorrar);
  const ac = t("[data-alta-comida]");
  if (ac) {
    document.querySelectorAll("[data-alta-comida]").forEach((x) => x.classList.toggle("activo", x === ac));
    return;
  }
  const al = t("[data-alimento]");
  if (al) {
    altaSel = D.alimentos[Number(al.dataset.alimento)];
    altaCant = 1;
    pintarAlta();
    $("altaResultados").innerHTML = resultadosAlimento($("buscaAlimento").value);
    $("altaDetalle").scrollIntoView({ block: "nearest" });
    return;
  }
  const cant = t("[data-alta-cant]");
  if (cant) {
    altaCant = Math.max(0.5, altaCant + Number(cant.dataset.altaCant));
    return pintarAlta();
  }
  if (t("[data-alta-guardar]") && altaSel) {
    const a = altaSel;
    return guardarComida({
      alimento: altaCant === 1 ? `${a.nombre} (${a.porcion})` : `${a.nombre} × ${fmt(altaCant)}`,
      grupo: norm(a.grupo),
      porciones: altaCant,
      kcal: Math.round((num(a.kcal) || 0) * altaCant),
      proteina_g: Math.round((num(a.proteina_g) || 0) * altaCant),
      nota: "",
    });
  }
  if (t("[data-alta-otro]")) {
    const nombre = $("otroNombre").value.trim();
    const kcal = num($("otroKcal").value.replace(",", "."));
    if (!nombre || kcal == null) return showToast("Escribe el nombre y las kcal.");
    return guardarComida({ alimento: nombre, grupo: "extra", porciones: "", kcal, proteina_g: num($("otroProt").value.replace(",", ".")) ?? "", nota: "" });
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "buscaAlimento") $("altaResultados").innerHTML = resultadosAlimento(ev.target.value);
});
