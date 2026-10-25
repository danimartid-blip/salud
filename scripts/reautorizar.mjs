// Renueva la autorización de Google que usan los scripts locales (y el servidor
// MCP de Drive) cuando falla con `invalid_grant`.
//
//   node scripts/reautorizar.mjs
//
// Abre un servidor en localhost, imprime el enlace de autorización y espera a
// que el dueño de la cuenta lo apruebe en su navegador. Guarda el token nuevo
// donde lo leen `auth.mjs` y el MCP de Drive, con respaldo del anterior.
// Permisos: Drive en solo lectura y Google Sheets.
import fs from "fs";
import os from "os";
import http from "http";
import { google } from "googleapis";

const DIR = `${os.homedir()}\\.claude\\gdrive-mcp`;
const ARCHIVO = `${DIR}\\.gdrive-server-credentials.json`;
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/spreadsheets"];

const keys = JSON.parse(fs.readFileSync(`${DIR}\\gcp-oauth.keys.json`, "utf-8")).installed;

const servidor = http.createServer();
servidor.listen(0, "127.0.0.1", () => {
  const puerto = servidor.address().port;
  const cliente = new google.auth.OAuth2(keys.client_id, keys.client_secret, `http://localhost:${puerto}`);
  const url = cliente.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  console.log(`ABRIR ESTE ENLACE PARA AUTORIZAR:\n${url}\n`);

  servidor.on("request", async (req, res) => {
    const code = new URL(req.url, `http://localhost:${puerto}`).searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Falta el codigo de autorizacion.");
      return;
    }
    try {
      const { tokens } = await cliente.getToken(code);
      if (fs.existsSync(ARCHIVO)) fs.copyFileSync(ARCHIVO, `${ARCHIVO}.respaldo`);
      fs.writeFileSync(ARCHIVO, JSON.stringify(tokens, null, 2));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<h2>Listo. Ya puedes cerrar esta pestaña y volver a Claude.</h2>");
      console.log("AUTORIZACION GUARDADA");
    } catch (e) {
      res.writeHead(500).end("No se pudo completar la autorizacion.");
      console.error("ERROR", e.message);
    } finally {
      servidor.close();
    }
  });
});
