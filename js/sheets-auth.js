// Google Identity Services (OAuth 100% en el navegador) + lectura de la planilla.
// Sin backend y sin client secret: el token vive solo en el localStorage de este
// navegador.
//
// OJO: todas las apps de danimartid-blip.github.io comparten origen, o sea
// comparten localStorage. Esta clave es propia de esta app, distinta a la de
// Finanzas ("gsheets_token"), para que cerrar sesión en una no afecte a la otra.
// Lleva "_rw" porque el permiso pasó de solo lectura a lectura y escritura: un
// token viejo de solo lectura guardado con la clave anterior no sirve para
// marcar metas, y con la clave nueva la app pide entrar de nuevo una vez.
const TOKEN_KEY = "salud_token_rw";
let tokenClient = null;
let tokenClientReady = null;

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt > Date.now() + 30_000) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function storeToken(tokenResponse) {
  const expiresAt = Date.now() + (Number(tokenResponse.expires_in) || 3300) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: tokenResponse.access_token, expiresAt }));
}

function waitForGis() {
  if (tokenClientReady) return tokenClientReady;
  tokenClientReady = new Promise((resolve, reject) => {
    const check = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else setTimeout(check, 100);
    };
    check();
    setTimeout(() => reject(new Error("Google Identity Services no cargó")), 15000);
  });
  return tokenClientReady;
}

async function ensureTokenClient() {
  await waitForGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: window.APP_CONFIG.CLIENT_ID,
      scope: window.APP_CONFIG.SCOPES,
      callback: () => {},
      error_callback: (err) => tokenClient?._onError?.(err),
    });
  }
  return tokenClient;
}

const ESPERA_LOGIN_MS = 60_000;

/** Devuelve un token válido, abriendo el login de Google si hace falta.
 * Pase lo que pase resuelve o rechaza: si el navegador bloquea el popup, GIS no
 * llama nunca al callback, y sin el error_callback + timeout la pantalla
 * quedaría cargando para siempre. */
async function getAccessToken() {
  const cached = loadStoredToken();
  if (cached) return cached.accessToken;

  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    let timer = null;
    const terminar = (fn) => {
      clearTimeout(timer);
      client.callback = () => {};
      client._onError = null;
      fn();
    };
    timer = setTimeout(
      () => terminar(() => reject(new Error("No se pudo renovar la sesión de Google. Recarga la página para volver a entrar."))),
      ESPERA_LOGIN_MS
    );
    client.callback = (resp) =>
      terminar(() => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        storeToken(resp);
        resolve(resp.access_token);
      });
    client._onError = (err) =>
      terminar(() => reject(new Error(err?.message || "No se pudo abrir el login de Google. Recarga la página.")));
    client.requestAccessToken({ prompt: "" });
  });
}

function isLoggedIn() {
  return !!loadStoredToken();
}

function logout() {
  const cached = loadStoredToken();
  localStorage.removeItem(TOKEN_KEY);
  if (cached && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cached.accessToken, () => {});
  }
}

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Lee varias pestañas en UNA petición. Devuelve { NombrePestaña: filas[][] }.
 * Sin formatear, para que los números lleguen como número y no como el texto
 * con coma decimal que muestra la planilla. */
async function readTabs(tabs) {
  const token = await getAccessToken();
  const qs = tabs.map((t) => `ranges=${encodeURIComponent(`${t}!A1:Z`)}`).join("&");
  const res = await fetch(
    `${SHEETS_BASE}/${window.APP_CONFIG.SPREADSHEET_ID}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error("La sesión venció. Vuelve a entrar.");
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error("Esta cuenta de Google no tiene acceso a esta ficha. Cierra sesión y entra con la cuenta correcta, o abre de nuevo tu enlace personal.");
  }
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = {};
  tabs.forEach((t, i) => (out[t] = data.valueRanges?.[i]?.values || []));
  return out;
}

async function sheetsFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${window.APP_CONFIG.SPREADSHEET_ID}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function readRange(range) {
  const data = await sheetsFetch(`/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  return data.values || [];
}

// Siempre RAW: con USER_ENTERED, Sheets convierte "2026-10-12" en un número de
// serie de fecha y la fila deja de encontrarse por su texto.
async function updateRange(range, values) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
}

async function appendRow(range, row) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

function requireAuthOrRedirect() {
  if (isLoggedIn()) return true;
  location.replace("login.html");
  return false;
}

window.SheetsAuth = { getAccessToken, isLoggedIn, logout, requireAuthOrRedirect };
window.SheetsApi = { readTabs, readRange, updateRange, appendRow };
