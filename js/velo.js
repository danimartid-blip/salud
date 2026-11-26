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
  for (const c of D.comidas) porDia.set(c.fecha, (porDia.get(c.fecha) || 0) + (num(c.kcal) || 0));
  const fechas = [...porDia.keys()].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const primero = fechas.length ? aFecha(fechas[0]) : hoy;
  const n = Math.max(7, Math.min(DIAS_MAX, Math.round((+hoy - +primero) / UN_DIA) + 1));
  // Más 4 días futuros, solo de adorno: la perilla no pasa de hoy.
  return Array.from({ length: n + 4 }, (_, i) => {
    const d = masDias(hoy, i - n + 1), k = ymd(d);
    return { d, k, kcal: Math.round(porDia.get(k) || 0), con: porDia.has(k), fut: i >= n };
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
  </section>`;
}

// ---------- La perilla ----------

/** Dibuja el tambor girado en la posición f (puede ser fraccionaria). */
function girarPerilla(per, f) {
  const ancho = per.clientWidth / 2;
  for (const el of per.querySelectorAll(".pq-dia")) {
    const a = (Number(el.dataset.i) - f) * ANG_DIA;
    if (Math.abs(a) > 84) {
      el.style.visibility = "hidden";
      continue;
    }
    const rad = (a * Math.PI) / 180;
    el.style.visibility = "";
    el.style.transform = `translateX(${(Math.sin(rad) * ancho * 0.98).toFixed(1)}px) scaleX(${Math.cos(rad).toFixed(3)})`;
    el.style.opacity = (0.25 + 0.75 * Math.cos(rad)).toFixed(2);
    el.classList.toggle("centro", Math.abs(a) < ANG_DIA / 2);
  }
  // Las estrías del cilindro giran junto con los días.
  per.style.setProperty("--estria", `${(-f * PX_DIA) % 12}px`);
}

/** Calorías interpoladas en la posición f, para que la aguja "pase" por cada día. */
function kcalEn(dias, f) {
  const i = Math.floor(f), t = f - i;
  const a = dias[Math.max(0, Math.min(dias.length - 1, i))].kcal;
  const b = dias[Math.max(0, Math.min(dias.length - 1, i + 1))].kcal;
  return a + (b - a) * t;
}

let perillaEstado = null;

function montarPerilla() {
  const per = $("perilla");
  if (!per || per._montada) return;
  per._montada = true;
  const dias = veloDias();
  const svg = per.parentElement.querySelector(".velo");
  const metaK = Number(svg.dataset.meta);
  let pos = veloIdx, ultimoEntero = veloIdx, anim = null;

  const mostrar = (f) => {
    pos = Math.max(0, Math.min(ultimoDia(dias) + 0.35, f)); // un poco de rebote pasado hoy
    girarPerilla(per, pos);
    moverVelo(svg, kcalEn(dias, Math.min(pos, ultimoDia(dias))));
    const i = Math.round(pos);
    if (i !== ultimoEntero) {
      ultimoEntero = i;
      try { navigator.vibrate?.(4); } catch {}
      $("veloDia").textContent = nombreDia(dias[i]);
      const p = promedio7(dias, i);
      $("veloProm").innerHTML = p != null ? `prom. 7 días <b>${p.toLocaleString("es-CL")}</b>` : "";
      per.setAttribute("aria-valuenow", i);
      per.setAttribute("aria-valuetext", nombreDia(dias[i]));
    }
  };

  /** Lleva la perilla a un día con un frenado suave y deja el pie al día. */
  const irA = (destino) => {
    destino = Math.max(0, Math.min(ultimoDia(dias), Math.round(destino)));
    cancelAnimationFrame(anim);
    const desde = pos, t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(destino - desde) * 40);
    const paso = (t) => {
      const u = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - u, 3);
      mostrar(desde + (destino - desde) * e);
      if (u < 1) anim = requestAnimationFrame(paso);
      else {
        veloIdx = destino;
        $("veloPie").innerHTML = textoResto(dias[destino], metaK);
        svg.setAttribute("aria-label", `${dias[destino].kcal} de ${metaK} kilocalorías`);
      }
    };
    anim = requestAnimationFrame(paso);
  };

  per.addEventListener("pointerdown", (ev) => {
    cancelAnimationFrame(anim);
    try { per.setPointerCapture(ev.pointerId); } catch {}
    per.classList.add("girando");
    perillaEstado = { x: ev.clientX, pos, t: performance.now(), v: 0, lx: ev.clientX };
  });
  per.addEventListener("pointermove", (ev) => {
    if (!perillaEstado) return;
    const now = performance.now(), dt = Math.max(1, now - perillaEstado.t);
    perillaEstado.v = 0.8 * ((ev.clientX - perillaEstado.lx) / dt) + 0.2 * perillaEstado.v; // px/ms
    perillaEstado.t = now;
    perillaEstado.lx = ev.clientX;
    mostrar(perillaEstado.pos - (ev.clientX - perillaEstado.x) / PX_DIA);
  });
  const soltar = () => {
    if (!perillaEstado) return;
    per.classList.remove("girando");
    const v = perillaEstado.v;
    perillaEstado = null;
    irA(pos - Math.max(-7, Math.min(7, (v * 180) / PX_DIA))); // un impulso rápido sigue girando un poco (máx. 7 días)
  };
  per.addEventListener("pointerup", soltar);
  per.addEventListener("pointercancel", soltar);
  per.addEventListener("keydown", (ev) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, Home: -dias.length, End: dias.length }[ev.key];
    if (d == null) return;
    ev.preventDefault();
    irA(Math.round(pos) + d);
  });
  girarPerilla(per, pos);
}

document.addEventListener("click", (ev) => {
  if (!ev.target.closest("[data-velo-dia]")) return;
  const dias = veloDias();
  diarioDia = dias[veloIdx ?? ultimoDia(dias)].k;
  subNutri = "diario";
  location.hash = "nutricion";
});

// ---------- Pendientes del Inicio ----------

function pendientesInicio() {
  const lista = pendientes().slice(0, 5);
  if (!lista.length) return `<div class="pend-card"><p class="pend-vacio">Nada pendiente. Bien ahí.</p></div>`;
  const resto = pendientes().length - lista.length;
  return `<div class="pend-card" role="list">${lista
    .map((a) => {
      const i = D.agenda.indexOf(a);
      const n = a._fecha ? diasHasta(a._fecha) : null;
      const cls = n == null ? "sin" : n < 0 ? "atrasado" : n <= 7 ? "pronto" : "";
      const cifra = n == null ? "—" : n < 0 ? "!" : n === 0 ? "Hoy" : n;
      const unidad = n == null ? "sin fecha" : n < 0 ? "atrasado" : n === 0 ? "" : n === 1 ? "día" : "días";
      return `<button type="button" class="pend ${cls}" data-pendiente="${i}" role="listitem">
        <span class="pend-cuenta"><b>${cifra}</b><small>${unidad}</small></span>
        <span class="pend-txt"><strong>${esc(a.titulo)}</strong><small>${esc(a.tipo || "Pendiente")}${a._fecha ? ` · ${a._fecha.getUTCDate()} ${MESES[a._fecha.getUTCMonth()]}` : ""}</small></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    })
    .join("")}${resto > 0 ? `<a class="pend-mas" href="#plan">+${resto} más en el plan</a>` : ""}</div>`;
}
