// Config compartida. Este repo es público: acá va SOLO código y el ID de la
// planilla. Ningún dato de salud vive en el repo — todo se lee en vivo desde la
// planilla privada, con el login de Google del propio usuario.
window.APP_CONFIG = {
  // Mismo cliente OAuth que las otras apps (proyecto personal-drive-mcp-507305).
  CLIENT_ID: "410252619718-jog7oi0j0cubhfcr8kee8p28kq4g8b3u.apps.googleusercontent.com",
  SPREADSHEET_ID: "1wGdx3_Y1vvQtYHXDuJywQDbC9osgKjHTWUfg2svbSBU",
  // Lectura y escritura: lo único que la app escribe es la pestaña Registro
  // (las metas diarias que se marcan). Todo lo demás lo actualiza la skill.
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  TABS: ["Perfil", "Resultados", "Indicadores", "Examenes", "Diagnosticos", "Medicamentos", "Agenda", "Preguntas", "Bitacora", "Cuerpo", "Habitos", "Metas", "Registro"],
};
