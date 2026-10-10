// Reusa el token OAuth ya otorgado al servidor MCP local de gdrive (mismo
// proyecto de Google Cloud, scope "spreadsheets").
//
// A propósito lee client_id/client_secret/token desde archivos FUERA del repo
// (este repo es público: nunca dejar credenciales ni datos de salud acá).
import fs from "fs";
import os from "os";
import { google } from "googleapis";

const CREDS_DIR = `${os.homedir()}\\.claude\\gdrive-mcp`;

export function getAuth() {
  const keys = JSON.parse(fs.readFileSync(`${CREDS_DIR}\\gcp-oauth.keys.json`, "utf-8")).installed;
  const savedCreds = JSON.parse(fs.readFileSync(`${CREDS_DIR}\\.gdrive-server-credentials.json`, "utf-8"));
  const oauth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret);
  oauth2Client.setCredentials(savedCreds);
  return oauth2Client;
}
