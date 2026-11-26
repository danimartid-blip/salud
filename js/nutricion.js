// Pestaña Nutrición: el día completo, en sub-secciones
//   Hoy (aquí: todas las metas del día, porciones y lo que falta; el velocímetro está en Inicio, velo.js) · Diario (diario.js)
//   · Entreno (entreno.js) · Despensa (despensa.js) · Pauta (pauta.js).
// En las fichas con Nutrición no hay pestaña Metas: todo vive aquí. Las fichas sin
// Nutrición siguen viendo Metas (metas.js) como siempre.
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

let subNutri = "hoy"; // hoy | diario | entreno | despensa | pauta

const hayNutricion = () => D.alimentos.length > 0 || D.pauta.length > 0 || D.conDespensa;

/** Todas las metas del día en una grilla de botones redondos: las de comida se
 * deciden solas con el Diario (si alcanza) y las demás se marcan con un toque. */
function metasDeHoy(k) {
  const ms = D.metas.filter((m) => norm(m.activo) !== "no");
  if (!ms.length) return "";
  const hechas = ms.filter((m) => hechaEn(m.id, k)).length;
  const r = metasManuales().length ? racha() : 0;
  const tiles = ms
    .map((m) => {
      const auto = segunDiario(m.id, k);
      const hecha = hechaEn(m.id, k);
      const rota = auto === false;
      const sub = auto != null ? (hecha ? "según tu diario" : "rota hoy") : esDeComida(m) ? "se ve en la cena" : hecha ? "lista" : "toca para marcar";
      return `<button type="button" class="hab${hecha ? " hecha" : ""}${rota ? " rota" : ""}" data-nutri-meta="${esc(m.id)}" role="checkbox" aria-checked="${hecha}" aria-label="${esc(m.nombre)}">
        <span class="hab-icono">${iconoMeta(m.icono)}</span>
        <span class="hab-nombre">${esc(m.nombre)}</span>
        <small>${sub}</small>
      </button>`;
    })
    .join("");
  return `<div class="hab-cab"><h2>Tus metas de hoy</h2><span class="hab-cuenta"><b>${hechas}</b>/${ms.length}${r ? ` · ${r} ${r === 1 ? "día" : "días"} de racha` : ""}</span></div>
  <div class="hab-grilla">${tiles}</div>`;
}

function vistaHoy() {
  const hoyK = ymd(hoyUTC());
  const { kcal, prot, usadas } = totalesDia(hoyK);
  const metaK = num(D.perfil.meta_kcal);
  const metas = metaPorciones();

  const barras = Object.entries(metas)
    .map(([g, meta]) => {
      const u = redondo(usadas[g] || 0);
      const cls = u > meta ? "sobre" : u >= meta ? "listo" : "";
      return `<div class="porc ${cls}"><span>${esc(GRUPOS[g] || g)}</span><span class="porc-num">${fmt(u)} / ${fmt(meta)}</span>
        <i style="width:${Math.min(100, (u / meta) * 100).toFixed(0)}%"></i></div>`;
    })
    .join("");

  // Para lo que falta, ejemplos de la lista: primero lo que hay en la despensa,
  // después los bajos en FODMAP.
  const faltan = Object.entries(metas).filter(([g, meta]) => (usadas[g] || 0) < meta && !["aceite", "libre"].includes(g));
  const alternativas = faltan
    .map(([g, meta]) => {
      const ops = D.alimentos
        .filter((a) => norm(a.grupo) === g)
        .map((a) => ({ a, casa: enDespensa(a.nombre) }))
        .sort((x, y) => y.casa - x.casa || (norm(x.a.fodmap) === "bajo" ? 0 : 1) - (norm(y.a.fodmap) === "bajo" ? 0 : 1))
        .slice(0, 4);
      if (!ops.length) return "";
      const n = redondo(meta - (usadas[g] || 0));
      return `<li><strong>${fmt(n)} ${esc(GRUPOS[g] || g)}:</strong> ${ops
        .map(({ a, casa }) => `${esc(a.nombre)} (${esc(a.porcion)})${casa ? ` <small class="en-casa">en tu despensa</small>` : ""}`)
        .join(" · ")}</li>`;
    })
    .join("");

  return `
  <div class="hoy-linea"><b>${kcal.toLocaleString("es-CL")}</b> kcal${metaK ? ` de ${metaK.toLocaleString("es-CL")}` : ""} · ${prot} g de proteína <a href="#inicio">ver velocímetro</a></div>
  <button type="button" class="btn-primary diario-agregar" data-diario-agregar>+ Agregar lo que comí</button>
  ${metasDeHoy(hoyK)}
  ${barras ? `<h2>Porciones de la pauta</h2><div class="card porciones">${barras}</div>` : ""}
  ${alternativas ? `<h2>Lo que te falta hoy</h2><div class="card"><ul class="alternativas">${alternativas}</ul></div>` : ""}`;
}

function vistaNutricion() {
  const secciones = [
    ...(D.alimentos.length ? [["hoy", "Hoy", Math.round(suma(delDia(ymd(hoyUTC())), "kcal"))], ["diario", "Diario", delDia(ymd(hoyUTC())).length]] : []),
    ...(D.rutina.length ? [["entreno", "Entreno", `${sesionesSemana()}/${num(D.perfil.meta_entrenos_semana) || 2}`]] : []),
    ...(D.conDespensa ? [["despensa", "Despensa", D.despensa.length]] : []),
    ...(D.pauta.length ? [["pauta", "Pauta", deSeccion("comida").length]] : []),
  ];
  if (!secciones.length) return `<div class="card"><p class="vacio">Todavía no hay datos de alimentación.</p></div>`;
  if (!secciones.some(([id]) => id === subNutri)) subNutri = secciones[0][0];
  const vista = { hoy: vistaHoy, diario: vistaDiario, entreno: vistaEntreno, despensa: vistaDespensa, pauta: vistaPauta }[subNutri];
  return subPestanas(secciones, subNutri, "data-sub-nutri") + vista();
}

document.addEventListener("click", (ev) => {
  const sn = ev.target.closest("[data-sub-nutri]");
  if (sn) {
    subNutri = sn.dataset.subNutri;
    pintar();
    window.scrollTo(0, 0);
    return;
  }
  // "+ Agregar" desde Hoy anota en hoy, aunque el Diario esté mirando otro día.
  if (subNutri === "hoy" && ev.target.closest("[data-diario-agregar]")) diarioDia = ymd(hoyUTC());
  const nm = ev.target.closest("[data-nutri-meta]");
  if (nm) {
    metasDia = ymd(hoyUTC()); // las metas de Hoy siempre son de hoy
    alternarMeta(nm.dataset.nutriMeta);
  }
});
