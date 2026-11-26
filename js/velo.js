// Velocímetro de calorías del Inicio, con una perilla de días tipo radio antigua.
//
// La perilla es un tambor que gira con el dedo: cada día es una franja estriada;
// mientras se arrastra, la aguja recorre las calorías de cada día (interpoladas
// entre uno y otro) y al soltar se acomoda en el día más cercano.
//
// Se carga antes de app.js y usa sus helpers recién al ejecutarse.

const VELO = { A0: 150, A1: 390, cx: 150, cy: 150, R: 118 };
const DIAS_MAX = 90;
const ANG_DIA = 15; // grados del tambor por día
const PX_DIA = 46; // pixeles de arrastre por día

let veloIdx = null; // día que se está mirando (índice en veloDias())
let agujaVista = null; // kcal ya animadas: la aguja se anima solo si cambian

/** Días con su total de calorías, del más antiguo a hoy. */
function veloDias() {
  const hoy = hoyUTC();
  const porDia = new Map();
  const protDia = new Map();
  for (const c of D.comidas) {
    porDia.set(c.fecha, (porDia.get(c.fecha) || 0) + (num(c.kcal) || 0));
    protDia.set(c.fecha, (protDia.get(c.fecha) || 0) + (num(c.proteina_g) || 0));
  }
  const fechas = [...porDia.keys()].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const primero = fechas.length ? aFecha(fechas[0]) : hoy;
  const n = Math.max(7, Math.min(DIAS_MAX, Math.round((+hoy - +primero) / UN_DIA) + 1));
  // Más 4 días futuros, solo de adorno: la perilla no pasa de hoy.
  return Array.from({ length: n + 4 }, (_, i) => {
    const d = masDias(hoy, i - n + 1), k = ymd(d);
    return { d, k, kcal: Math.round(porDia.get(k) || 0), prot: Math.round(protDia.get(k) || 0), con: porDia.has(k), fut: i >= n };
  });
}

const ultimoDia = (dias) => dias.length - 1 - dias.filter((x) => x.fut).length;
const veloMax = (metaK) => Math.ceil((metaK * 1.3) / 100) * 100;
const veloAng = (v, max) => VELO.A0 + (Math.min(Math.max(v, 0), max) / max) * (VELO.A1 - VELO.A0);
const veloPt = (a, r) => [VELO.cx + r * Math.cos((a * Math.PI) / 180), VELO.cy + r * Math.sin((a * Math.PI) / 180)];
const veloZona = (kcal, metaK) => (kcal > metaK * 1.1 ? "pasado" : kcal > metaK ? "ojo" : kcal >= metaK * 0.85 ? "ideal" : "bien");

function veloArco(v0, v1, r, max) {
  const a0 = veloAng(v0, max), a1 = veloAng(v1, max);
  const [x0, y0] = veloPt(a0, r), [x1, y1] = veloPt(a1, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** El dial: 240° de arco. Hasta el 85 % de la meta es "vas bien", del 85 al 100 %
 * la zona ideal, sobre la meta ámbar y sobre el 110 % rojo. */
function velocimetro(kcal, metaK) {
  const { cx, cy, R } = VELO;
  const max = veloMax(metaK);
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
    const [x0, y0] = veloPt(veloAng(v, max), R - 20), [x1, y1] = veloPt(veloAng(v, max), R - (grande ? 31 : 25));
    marcas.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${grande ? "m-grande" : "m-chica"}"/>`);
    if (grande && v > 0 && v < max) {
      const [tx, ty] = veloPt(veloAng(v, max), R - 45);
      marcas.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="m-num">${v >= 1000 ? `${String(v / 1000).replace(".", ",")}k` : v}</text>`);
    }
  }
  const [mx0, my0] = veloPt(veloAng(metaK, max), R + 12), [mx1, my1] = veloPt(veloAng(metaK, max), R - 12);
  const anima = agujaVista !== kcal;
  agujaVista = kcal;
  return `<svg viewBox="0 0 300 232" class="velo velo-${veloZona(kcal, metaK)}" role="img" aria-label="${kcal} de ${metaK} kilocalorías" data-meta="${metaK}">
    <path d="${veloArco(0, max, R, max)}" class="velo-pista"/>
    ${zonas.map(([a, b, c]) => `<path d="${veloArco(a, b, R + 13, max)}" class="velo-zona ${c}"/>`).join("")}
    <path d="${veloArco(0, max, R, max)}" class="velo-prog${anima ? " anima" : ""}" pathLength="100" style="stroke-dasharray:${veloPct(kcal, max)} 100;opacity:${kcal > 0 ? 1 : 0}"/>
    ${marcas.join("")}
    <line x1="${mx0.toFixed(1)}" y1="${my0.toFixed(1)}" x2="${mx1.toFixed(1)}" y2="${my1.toFixed(1)}" class="velo-meta"/>
    <g class="velo-aguja${anima ? " anima" : ""}" style="--giro:${(veloAng(kcal, max) - 270).toFixed(1)}deg;--desde:${(VELO.A0 - 270).toFixed(1)}deg">
      <path d="M150 ${cy - R + 30} L155.5 150 L144.5 150 Z"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="11" class="velo-eje"/>
    <circle cx="${cx}" cy="${cy}" r="4" class="velo-eje-c"/>
    <text x="150" y="196" class="velo-num">${kcal.toLocaleString("es-CL")}</text>
    <text x="150" y="216" class="velo-de">de ${metaK.toLocaleString("es-CL")} kcal</text>
  </svg>`;
}
const veloPct = (kcal, max) => (kcal > 0 ? Math.max(0.6, (Math.min(kcal, max) / max) * 100) : 0).toFixed(2);

/** Mueve el dial sin repintar (para seguir el dedo). */
function moverVelo(svg, kcal) {
  const metaK = Number(svg.dataset.meta), max = veloMax(metaK);
  svg.setAttribute("class", `velo velo-${veloZona(kcal, metaK)}`);
  const prog = svg.querySelector(".velo-prog"), aguja = svg.querySelector(".velo-aguja");
  prog.classList.remove("anima");
  aguja.classList.remove("anima");
  prog.style.strokeDasharray = `${veloPct(kcal, max)} 100`;
  prog.style.opacity = kcal > 0 ? 1 : 0;
  aguja.style.setProperty("--giro", `${(veloAng(kcal, max) - 270).toFixed(1)}deg`);
  svg.querySelector(".velo-num").textContent = Math.round(kcal).toLocaleString("es-CL");
}

const nombreDia = (x) => {
  const n = Math.round((+hoyUTC() - +x.d) / UN_DIA);
  return n === 0 ? "Hoy" : n === 1 ? "Ayer" : `${NOMBRE_DIA[diaSemana(x.d)][0].toUpperCase()}${NOMBRE_DIA[diaSemana(x.d)].slice(1)} ${x.d.getUTCDate()} ${MESES[x.d.getUTCMonth()]}`;
};

function textoResto(x, metaK) {
  if (!x.con) return `<span class="velo-pill vacio">Sin comidas anotadas</span>`;
  const r = metaK - x.kcal;
  return r >= 0
    ? `<span class="velo-pill">${x.k === ymd(hoyUTC()) ? "Te quedan" : "Quedaron"} <b>${r.toLocaleString("es-CL")}</b> kcal</span>`
    : `<span class="velo-pill mal">${x.k === ymd(hoyUTC()) ? "Te pasaste por" : "Pasado por"} <b>${(-r).toLocaleString("es-CL")}</b> kcal</span>`;
}

/** Promedio de los 7 días que terminan en el día elegido (solo días con algo anotado). */
function promedio7(dias, i) {
  const ds = dias.slice(Math.max(0, i - 6), i + 1).filter((x) => x.con);
  return ds.length ? Math.round(ds.reduce((s, x) => s + x.kcal, 0) / ds.length) : null;
}

/** Tarjeta del Inicio: perilla + velocímetro. */
function veloInicio() {
  const metaK = num(D.perfil.meta_kcal);
  if (!metaK || !D.comidas) return "";
  const dias = veloDias();
  if (veloIdx == null || veloIdx > ultimoDia(dias)) veloIdx = ultimoDia(dias);
  const x = dias[veloIdx];
  const prom = promedio7(dias, veloIdx);
  const max = veloMax(metaK);
  const franjas = dias
    .map(
      (y, i) => `<span class="pq-dia${y.con ? ` z-${veloZona(y.kcal, metaK)}` : " sin"}${y.fut ? " fut" : ""}" data-i="${i}">
        <small>${LETRA_DIA[diaSemana(y.d)]}</small><b>${y.d.getUTCDate()}</b><i style="--h:${y.con ? Math.max(8, Math.min(100, (y.kcal / max) * 100)).toFixed(0) : 0}"></i>
      </span>`
    )
    .join("");
  return `<section class="velo-card velo-inicio" aria-label="Calorías por día">
    <div class="velo-cab">
      <div><span class="velo-kicker">Calorías</span><strong id="veloDia">${esc(nombreDia(x))}</strong></div>
      <span class="velo-prom" id="veloProm">${prom != null ? `prom. 7 días <b>${prom.toLocaleString("es-CL")}</b>` : ""}</span>
    </div>
    <div class="perilla" id="perilla" role="slider" tabindex="0" aria-label="Elegir día" aria-valuemin="0" aria-valuemax="${ultimoDia(dias)}" aria-valuenow="${veloIdx}" aria-valuetext="${esc(nombreDia(x))}">
      <div class="pq-tambor">${franjas}</div>
      <div class="pq-visor" aria-hidden="true"></div>
    </div>
    <button type="button" class="velo-toque" data-velo-dia aria-label="Ver lo que comí ese día">${velocimetro(x.kcal, metaK)}</button>
    <div class="velo-pie" id="veloPie">${textoResto(x, metaK)}</div>
    ${tanque(x.prot)}
  </section>`;
}

// ---------- La perilla ----------

// ---------- Tambor: la ruedita que gira con el dedo ----------
// Lo usan la perilla de días del Inicio y las sub-pestañas de toda la app
// (Nutrición, Plan, Conclusiones…). Cada elemento con data-i es una franja del
// cilindro; se dibujan en perspectiva según su distancia al centro.

/**
 * @param el      contenedor (role=slider o tablist)
 * @param o.n     cuántas franjas
 * @param o.max   última franja elegible (las siguientes son de adorno)
 * @param o.ang   grados del cilindro por franja
 * @param o.px    pixeles de arrastre por franja
 * @param o.impulso cuántas franjas de más puede girar un lanzamiento rápido
 * @param o.alMover(f)   en cada cuadro, con la posición fraccionaria
 * @param o.alCambiar(i) al pasar a otra franja
 * @param o.alSoltar(i)  cuando se detiene en una franja
 */
function tambor(el, o) {
  if (el._montada) return;
  el._montada = true;
  const items = [...el.querySelectorAll("[data-i]")];
  const max = o.max ?? o.n - 1;
  let pos = o.inicio, entero = o.inicio, anim = null, toque = null, ultimoSuelto = 0;

  const dibujar = () => {
    const ancho = el.clientWidth / 2;
    for (const it of items) {
      const a = (Number(it.dataset.i) - pos) * o.ang;
      if (Math.abs(a) > 84) {
        it.style.visibility = "hidden";
        continue;
      }
      const rad = (a * Math.PI) / 180;
      it.style.visibility = "";
      it.style.transform = `translateX(${(Math.sin(rad) * ancho * 0.98).toFixed(1)}px) scaleX(${Math.cos(rad).toFixed(3)})`;
      it.style.opacity = (0.22 + 0.78 * Math.cos(rad)).toFixed(2);
      it.classList.toggle("centro", Math.abs(a) < o.ang / 2);
    }
    el.style.setProperty("--estria", `${(-pos * o.px) % 12}px`); // las estrías giran con el cilindro
  };

  const mostrar = (f) => {
    pos = Math.max(-0.35, Math.min(max + 0.35, f)); // un poco de rebote en los extremos
    dibujar();
    o.alMover?.(pos);
    const i = Math.max(0, Math.min(max, Math.round(pos)));
    if (i !== entero) {
      entero = i;
      try { navigator.vibrate?.(4); } catch {}
      o.alCambiar?.(i);
    }
  };

  const irA = (destino) => {
    destino = Math.max(0, Math.min(max, Math.round(destino)));
    cancelAnimationFrame(anim);
    const desde = pos, t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(destino - desde) * 40);
    const paso = (t) => {
      const u = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - u, 3);
      mostrar(desde + (destino - desde) * e);
      if (u < 1) anim = requestAnimationFrame(paso);
      else o.alSoltar?.(destino);
    };
    anim = requestAnimationFrame(paso);
  };

  el.addEventListener("pointerdown", (ev) => {
    cancelAnimationFrame(anim);
    try { el.setPointerCapture(ev.pointerId); } catch {}
    el.classList.add("girando");
    toque = { x: ev.clientX, pos, t: performance.now(), v: 0, lx: ev.clientX, movio: false };
  });
  el.addEventListener("pointermove", (ev) => {
    if (!toque) return;
    const now = performance.now(), dt = Math.max(1, now - toque.t);
    toque.v = 0.8 * ((ev.clientX - toque.lx) / dt) + 0.2 * toque.v; // px/ms
    toque.t = now;
    toque.lx = ev.clientX;
    if (Math.abs(ev.clientX - toque.x) > 6) toque.movio = true;
    if (toque.movio) mostrar(toque.pos - (ev.clientX - toque.x) / o.px);
  });
  el.addEventListener("pointerup", (ev) => {
    if (!toque) return;
    el.classList.remove("girando");
    const { v, movio } = toque;
    toque = null;
    ultimoSuelto = performance.now();
    const tope = o.impulso ?? 7; // un impulso rápido gira un poco más
    if (movio) return irA(pos - Math.max(-tope, Math.min(tope, (v * 180) / o.px)));
    // Un toque sobre una franja la trae al centro.
    const it = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-i]");
    if (it && el.contains(it)) irA(Number(it.dataset.i));
  });
  el.addEventListener("pointercancel", () => {
    toque = null;
    el.classList.remove("girando");
    irA(pos);
  });
  // Los clics de verdad dentro del tambor no pasan: elegir es soltar el tambor.
  el.addEventListener("click", (ev) => {
    if (!ev.isTrusted) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (performance.now() - ultimoSuelto > 400) {
      const it = ev.target.closest("[data-i]"); // teclado (Enter / espacio)
      if (it) irA(Number(it.dataset.i));
    }
  });
  el.addEventListener("keydown", (ev) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, Home: -o.n, End: o.n }[ev.key];
    if (d == null) return;
    ev.preventDefault();
    irA(Math.round(pos) + d);
  });
  dibujar();
}

/** Valor interpolado en la posición f, para que las agujas "pasen" por cada día. */
function valorEn(dias, f, campo) {
  f = Math.max(0, f);
  const i = Math.floor(f), t = f - i;
  const a = dias[Math.max(0, Math.min(dias.length - 1, i))][campo];
  const b = dias[Math.max(0, Math.min(dias.length - 1, i + 1))][campo];
  return a + (b - a) * t;
}

function montarPerilla() {
  const per = $("perilla");
  if (!per) return;
  const dias = veloDias();
  const svg = per.parentElement.querySelector(".velo");
  const tanque = per.parentElement.querySelector(".tanque");
  const metaK = Number(svg.dataset.meta);
  const ult = ultimoDia(dias);
  tambor(per, {
    n: dias.length,
    max: ult,
    inicio: veloIdx,
    ang: ANG_DIA,
    px: PX_DIA,
    alMover: (f) => {
      moverVelo(svg, valorEn(dias, Math.min(f, ult), "kcal"));
      if (tanque) moverTanque(tanque, valorEn(dias, Math.min(f, ult), "prot"));
    },
    alCambiar: (i) => {
      $("veloDia").textContent = nombreDia(dias[i]);
      const p = promedio7(dias, i);
      $("veloProm").innerHTML = p != null ? `prom. 7 días <b>${p.toLocaleString("es-CL")}</b>` : "";
      per.setAttribute("aria-valuenow", i);
      per.setAttribute("aria-valuetext", nombreDia(dias[i]));
    },
    alSoltar: (i) => {
      veloIdx = i;
      $("veloPie").innerHTML = textoResto(dias[i], metaK);
      svg.setAttribute("aria-label", `${dias[i].kcal} de ${metaK} kilocalorías`);
    },
  });
}

/** Sub-pestañas como tambor claro: al soltarlo en una, se elige esa (dispara el
 * mismo clic que antes daban los botones, así cada vista sigue igual). */
function montarRuedas() {
  for (const r of document.querySelectorAll(".rueda")) {
    if (r._montada) continue;
    const items = r.querySelectorAll("[data-i]");
    const inicio = Number(r.dataset.actual);
    const ancho = items[0]?.offsetWidth || 120;
    tambor(r, {
      n: items.length,
      inicio,
      ang: Math.min(40, (Math.asin(Math.min(0.9, (ancho * 1.12) / (r.clientWidth / 2))) * 180) / Math.PI),
      px: ancho,
      impulso: 1,
      alSoltar: (i) => {
        if (i !== inicio) items[i].click();
      },
    });
  }
}

// ---------- Tanque de proteína (como el de la bencina) ----------

/** Medidor de proteína del día: de E a F, con la meta de la nutricionista como
 * "lleno". Sin meta en el Perfil, la escala llega a 120 g y lo avisa. */
function tanque(prot) {
  const metaP = num(D.perfil.meta_proteina_g);
  const lleno = metaP || 120;
  const ang = (g) => 205 + (Math.min(Math.max(g, 0), lleno) / lleno) * 130; // de 205° (E) a 335° (F)
  const pt = (a, r) => [70 + r * Math.cos((a * Math.PI) / 180), 66 + r * Math.sin((a * Math.PI) / 180)];
  const marcas = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const a = 205 + f * 130, [x0, y0] = pt(a, 44), [x1, y1] = pt(a, f % 0.5 === 0 ? 34 : 38);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="tq-m${f === 0 ? " tq-e" : ""}"/>`;
    })
    .join("");
  const [ex, ey] = pt(205, 26), [fx, fy] = pt(335, 26), [a0x, a0y] = pt(205, 48), [a1x, a1y] = pt(335, 48);
  return `<div class="tanque" data-lleno="${lleno}">
    <svg viewBox="0 0 140 84" role="img" aria-label="Proteína del día">
      <path d="M${a0x.toFixed(1)} ${a0y.toFixed(1)}A48 48 0 0 1 ${a1x.toFixed(1)} ${a1y.toFixed(1)}" class="tq-arco"/>
      <path d="M${a0x.toFixed(1)} ${a0y.toFixed(1)}A48 48 0 0 1 ${a1x.toFixed(1)} ${a1y.toFixed(1)}" class="tq-nivel" pathLength="100" style="stroke-dasharray:${((Math.min(prot, lleno) / lleno) * 100).toFixed(1)} 100"/>
      ${marcas}
      <text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" class="tq-letra tq-e">E</text>
      <text x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" class="tq-letra">F</text>
      <g transform="translate(80 54)" class="tq-bomba"><path d="M1 1h7v12H1zM2.5 3.5h4v3h-4zM8 5l3 2v5a1.2 1.2 0 0 0 2.4 0V5.5L11 3"/></g>
      <g class="tq-aguja" style="--g:${(ang(prot) - 270).toFixed(1)}deg"><path d="M70 22 L72.6 66 L67.4 66 Z"/></g>
      <circle cx="70" cy="66" r="5.5" class="tq-eje"/>
    </svg>
    <div class="tq-txt"><b><span class="tq-num">${Math.round(prot)}</span><small> g</small></b><span>proteína${metaP ? ` de ${metaP} g` : ""}</span>${metaP ? "" : `<em>falta tu meta</em>`}</div>
  </div>`;
}

function moverTanque(el, prot) {
  const lleno = Number(el.dataset.lleno);
  el.querySelector(".tq-nivel").style.strokeDasharray = `${((Math.min(prot, lleno) / lleno) * 100).toFixed(1)} 100`;
  el.querySelector(".tq-aguja").style.setProperty("--g", `${(205 + (Math.min(Math.max(prot, 0), lleno) / lleno) * 130 - 270).toFixed(1)}deg`);
  el.querySelector(".tq-num").textContent = Math.round(prot);
  el.classList.toggle("lleno", prot >= lleno);
}

document.addEventListener("click", (ev) => {
  if (!ev.target.closest("[data-velo-dia]")) return;
  const dias = veloDias();
  diarioDia = dias[veloIdx ?? ultimoDia(dias)].k;
  subNutri = "diario";
  location.hash = "nutricion";
});
