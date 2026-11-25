// Pestaña Nutrición: el día completo, en sub-secciones
//   Hoy (aquí: velocímetro de calorías y todas las metas del día) · Diario (diario.js)
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

// La aguja se anima solo cuando cambian las calorías, no en cada repintado.
let agujaVista = null;

/** Velocímetro de calorías: 240° de arco. Hasta el 85 % de la meta es "vas bien",
 * del 85 al 100 % la zona ideal, sobre la meta ámbar y sobre el 110 % rojo. */
function velocimetro(kcal, metaK) {
  const max = Math.ceil((metaK * 1.3) / 100) * 100;
  const A0 = 150, A1 = 390; // grados, sentido horario desde el eje x
  const cx = 150, cy = 150, R = 118;
  const ang = (v) => A0 + (Math.min(v, max) / max) * (A1 - A0);
  const pt = (a, r) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const arco = (v0, v1, r) => {
    const a0 = ang(v0), a1 = ang(v1);
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const zonas = [
    [0, metaK * 0.85, "z-bien"],
    [metaK * 0.85, metaK, "z-ideal"],
    [metaK, metaK * 1.1, "z-ojo"],
    [metaK * 1.1, max, "z-pasado"],
  ];
  const paso = max > 2400 ? 500 : 250;
  const marcas = [];
  for (let v = 0; v <= max; v += paso / 5) {
    const grande = v % paso === 0;
    const [x0, y0] = pt(ang(v), R - 20), [x1, y1] = pt(ang(v), R - (grande ? 31 : 25));
    marcas.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${grande ? "m-grande" : "m-chica"}"/>`);
    if (grande && v > 0 && v < max) {
      const [tx, ty] = pt(ang(v), R - 44);
      marcas.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="m-num">${v >= 1000 ? `${String(v / 1000).replace(".", ",")}k` : v}</text>`);
    }
  }
  const [mx0, my0] = pt(ang(metaK), R + 12), [mx1, my1] = pt(ang(metaK), R - 12);
  const estado = kcal > metaK * 1.1 ? "pasado" : kcal > metaK ? "ojo" : kcal >= metaK * 0.85 ? "ideal" : "bien";
  const giro = ang(kcal) - 270; // la aguja se dibuja apuntando hacia arriba (270°)
  const anima = agujaVista !== kcal;
  agujaVista = kcal;
  return `<svg viewBox="0 0 300 232" class="velo velo-${estado}" role="img" aria-label="${kcal} de ${metaK} kilocalorías">
    <defs>
      <linearGradient id="veloProg" x1="0" x2="1"><stop offset="0" stop-color="#5ec8f2"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    </defs>
    <path d="${arco(0, max, R)}" class="velo-pista"/>
    ${zonas.map(([a, b, c]) => `<path d="${arco(a, b, R + 13)}" class="velo-zona ${c}"/>`).join("")}
    ${kcal > 0 ? `<path d="${arco(0, Math.max(kcal, max * 0.004), R)}" class="velo-prog${anima ? " anima" : ""}" pathLength="100" style="--hasta:${(100 - (Math.min(kcal, max) / max) * 100).toFixed(1)}"/>` : ""}
    ${marcas.join("")}
    <line x1="${mx0.toFixed(1)}" y1="${my0.toFixed(1)}" x2="${mx1.toFixed(1)}" y2="${my1.toFixed(1)}" class="velo-meta"/>
    <g class="velo-aguja${anima ? " anima" : ""}" style="--giro:${giro.toFixed(1)}deg;--desde:${(A0 - 270).toFixed(1)}deg">
      <path d="M150 ${cy - R + 30} L155.5 150 L144.5 150 Z"/>
    </g>
    <circle cx="150" cy="150" r="11" class="velo-eje"/>
    <circle cx="150" cy="150" r="4" class="velo-eje-c"/>
    <text x="150" y="196" class="velo-num">${kcal.toLocaleString("es-CL")}</text>
    <text x="150" y="216" class="velo-de">de ${metaK.toLocaleString("es-CL")} kcal</text>
  </svg>`;
}

/** Calorías por comida, en una barra apilada. */
function barraComidas(filas, total) {
  if (!total) return "";
  const partes = COMIDAS_DIA.map(([c], i) => [c, Math.round(suma(filas.filter((f) => norm(f.comida) === norm(c)), "kcal")), i]);
  const otras = Math.round(total - partes.reduce((s, p) => s + p[1], 0));
  if (otras > 0) partes.push(["Otra", otras, 4]);
  return `<div class="por-comida">
    <div class="pc-barra">${partes.filter((p) => p[1] > 0).map(([c, v, i]) => `<i class="pc${i}" style="flex:${v}" title="${esc(c)}"></i>`).join("")}</div>
    <div class="pc-ley">${partes
      .map(([c, v, i]) => `<span class="${v ? "" : "vacia"}"><i class="pc${i}"></i>${esc(c)} <b>${v ? v.toLocaleString("es-CL") : "—"}</b></span>`)
      .join("")}</div>
  </div>`;
}

function vistaHoy() {
  const hoyK = ymd(hoyUTC());
  const { filas, kcal, prot, usadas } = totalesDia(hoyK);
  const metaK = num(D.perfil.meta_kcal);
  const metaP = num(D.perfil.meta_proteina_g);
  const metas = metaPorciones();
  const resto = metaK ? metaK - kcal : 0;

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

  const comidasHechas = COMIDAS_DIA.filter(([c]) => filas.some((f) => norm(f.comida) === norm(c))).length;
  const cabeza = metaK
    ? `<div class="velo-card">
        ${velocimetro(kcal, metaK)}
        <div class="velo-pill ${resto < 0 ? "mal" : ""}">${resto >= 0 ? `Te quedan <b>${resto.toLocaleString("es-CL")}</b> kcal` : `Te pasaste por <b>${(-resto).toLocaleString("es-CL")}</b> kcal`}</div>
        <div class="velo-stats">
          <div><b>${prot}<small> g</small></b><span>proteína${metaP ? ` de ${metaP}` : ""}</span>${metaP ? `<i style="--p:${Math.min(100, (prot / metaP) * 100).toFixed(0)}%"></i>` : ""}</div>
          <div><b>${comidasHechas}<small>/${COMIDAS_DIA.length}</small></b><span>comidas anotadas</span></div>
          <div><b>${metaK ? Math.round((kcal / metaK) * 100) : 0}<small>%</small></b><span>de tu meta</span></div>
        </div>
        ${barraComidas(filas, kcal)}
      </div>`
    : `<div class="card diario-total"><div class="diario-cifra"><b>${kcal.toLocaleString("es-CL")}</b> kcal</div><p>${prot} g de proteína</p></div>`;

  return `
  ${cabeza}
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
  return subPestanas(secciones, subNutri, "data-sub-nutri", secciones.length > 4) + vista();
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
