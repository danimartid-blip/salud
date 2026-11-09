// Pestaña Nutrición: todo lo de alimentación, en sub-secciones
//   Hoy (aquí) · Diario (diario.js) · Despensa (despensa.js) · Pauta (pauta.js).
// Las metas de alimentación (REGLAS_DIARIO de metas.js) se ven en Hoy; en Metas
// quedan solo las manuales.
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

let subNutri = "hoy"; // hoy | diario | despensa | pauta

const hayNutricion = () => D.alimentos.length > 0 || D.pauta.length > 0 || D.conDespensa;

/** Metas de alimentación del día: ✓ cumplida, ✕ rota, o pendiente. Si el Diario no
 * alcanza para decidir, vale lo marcado a mano (y se puede marcar desde aquí). */
function metasComidaHoy(k) {
  const ms = D.metas.filter(esDeComida);
  if (!ms.length) return "";
  const filas = ms
    .map((m) => {
      const auto = segunDiario(m.id, k);
      const hecha = hechaEn(m.id, k);
      const estado = auto == null ? (hecha ? "Marcada a mano" : "Se define al anotar almuerzo y cena") : hecha ? "Cumplida según tu diario" : "No cumplida hoy";
      return `<div class="meta${hecha ? " hecha" : ""}${auto != null ? " auto" : ""}">
        <button type="button" class="meta-check" data-nutri-meta="${esc(m.id)}" role="checkbox" aria-checked="${hecha}" aria-label="${esc(m.nombre)}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <button type="button" class="meta-cuerpo" data-meta-info="${esc(m.id)}">
          <span class="meta-icono">${iconoMeta(m.icono)}</span>
          <span class="meta-txt"><strong>${esc(m.nombre)}</strong><small class="meta-auto">${estado}</small></span>
        </button>
      </div>`;
    })
    .join("");
  return `<h2>Metas de alimentación</h2><div class="card lista">${filas}</div>`;
}

function vistaHoy() {
  const hoyK = ymd(hoyUTC());
  const { kcal, prot, usadas } = totalesDia(hoyK);
  const metaK = num(D.perfil.meta_kcal);
  const metas = metaPorciones();
  const pct = metaK ? Math.min(100, Math.round((kcal / metaK) * 100)) : 0;
  const pasado = metaK && kcal > metaK;

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
  <div class="card diario-total${pasado ? " pasado" : ""}">
    <div class="diario-cifra"><b>${kcal.toLocaleString("es-CL")}</b> kcal${metaK ? ` <span>de ${metaK.toLocaleString("es-CL")}</span>` : ""}</div>
    ${metaK ? `<div class="diario-barra"><i style="width:${pct}%"></i></div>` : ""}
    <p>${prot} g de proteína${metaK ? ` · ${pasado ? `te pasaste por ${(kcal - metaK).toLocaleString("es-CL")} kcal` : `te quedan ${(metaK - kcal).toLocaleString("es-CL")} kcal`}` : ""}</p>
  </div>
  <button type="button" class="btn-primary diario-agregar" data-diario-agregar>+ Agregar lo que comí</button>
  ${barras ? `<h2>Porciones de la pauta</h2><div class="card porciones">${barras}</div>` : ""}
  ${metasComidaHoy(hoyK)}
  ${alternativas ? `<h2>Lo que te falta hoy</h2><div class="card"><ul class="alternativas">${alternativas}</ul></div>` : ""}`;
}

function vistaNutricion() {
  const secciones = [
    ...(D.alimentos.length ? [["hoy", "Hoy", Math.round(suma(delDia(ymd(hoyUTC())), "kcal"))], ["diario", "Diario", delDia(ymd(hoyUTC())).length]] : []),
    ...(D.conDespensa ? [["despensa", "Despensa", D.despensa.length]] : []),
    ...(D.pauta.length ? [["pauta", "Pauta", deSeccion("comida").length]] : []),
  ];
  if (!secciones.length) return `<div class="card"><p class="vacio">Todavía no hay datos de alimentación.</p></div>`;
  if (!secciones.some(([id]) => id === subNutri)) subNutri = secciones[0][0];
  const vista = { hoy: vistaHoy, diario: vistaDiario, despensa: vistaDespensa, pauta: vistaPauta }[subNutri];
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
