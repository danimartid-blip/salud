// Config compartida. Este repo es público: acá va SOLO código y el ID de la
// planilla. Ningún dato de salud vive en el repo — todo se lee en vivo desde la
// planilla privada, con el login de Google del propio usuario.

/** Cada persona tiene su propia planilla. Su enlace personal trae `?db=<ID>`:
 * la primera vez que se abre, el ID queda guardado en ese celular y desde ahí la
 * app (también la instalada, que abre sin parámetros) siempre lee esa planilla.
 * El ID no es una llave: Google solo entrega la planilla a una cuenta que tenga
 * permiso sobre ella. Sin enlace ni nada guardado, se usa la planilla original. */
const PLANILLA_PROPIA = (() => {
  const POR_DEFECTO = "1wGdx3_Y1vvQtYHXDuJywQDbC9osgKjHTWUfg2svbSBU";
  try {
    const delEnlace = new URLSearchParams(location.search).get("db");
    if (delEnlace && /^[\w-]{25,80}$/.test(delEnlace)) {
      localStorage.setItem("salud_db", delEnlace);
      sessionStorage.removeItem("salud_ver");
      // Se limpia la dirección para que el ID no quede a la vista ni en el historial.
      history.replaceState(null, "", location.pathname + location.hash);
    }
    return localStorage.getItem("salud_db") || POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
})();

/** Ficha de otra persona que se está mirando (por ejemplo, la de un abuelo).
 * Vive en sessionStorage a propósito: al cerrar y volver a abrir la app, cada
 * uno vuelve siempre a su propia ficha. */
const PLANILLA_VIENDO = (() => {
  try {
    const v = sessionStorage.getItem("salud_ver");
    return v && v !== PLANILLA_PROPIA && /^[\w-]{25,80}$/.test(v) ? v : null;
  } catch {
    return null;
  }
})();
const PLANILLA = PLANILLA_VIENDO || PLANILLA_PROPIA;

window.APP_CONFIG = {
  // Mismo cliente OAuth que las otras apps (proyecto personal-drive-mcp-507305).
  CLIENT_ID: "410252619718-jog7oi0j0cubhfcr8kee8p28kq4g8b3u.apps.googleusercontent.com",
  SPREADSHEET_ID: PLANILLA,
  PLANILLA_PROPIA,
  VIENDO_OTRA: !!PLANILLA_VIENDO,
  // Lectura y escritura: lo único que la app escribe es la pestaña Registro
  // (las metas diarias que se marcan). Todo lo demás lo actualiza la skill.
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  TABS: ["Perfil", "Resultados", "Indicadores", "Examenes", "Diagnosticos", "Medicamentos", "Agenda", "Preguntas", "Bitacora", "Cuerpo", "Habitos", "Metas", "Registro"],
};
