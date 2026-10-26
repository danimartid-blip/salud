// Herramienta para leer y escribir la planilla "Salud App - DB".
// La usa la skill medico-personal para mantener los datos al día.
//
//   node scripts/sheet.mjs crear                      crea las pestañas que falten y sus encabezados
//   node scripts/sheet.mjs leer <Pestaña>             imprime las filas como JSON
//   node scripts/sheet.mjs agregar <Pestaña> <json>   agrega filas al final
//   node scripts/sheet.mjs reemplazar <Pestaña> <json>  borra el contenido y escribe estas filas
//   node scripts/sheet.mjs cargar <json>              { Pestaña: [filas] } -> reemplaza cada pestaña incluida
//
// Las filas del JSON son objetos con las claves del encabezado ({ "fecha": ..., "analito": ... }).
// Los archivos JSON con datos van SIEMPRE fuera de este repo (es público).
//
// Todo se escribe con valueInputOption RAW: con USER_ENTERED, Sheets convierte
// "2026-05-21" en un número de serie y "5.5" puede terminar como fecha.
import fs from "fs";
import { google } from "googleapis";
import { getAuth } from "./auth.mjs";

const SPREADSHEET_ID = "1wGdx3_Y1vvQtYHXDuJywQDbC9osgKjHTWUfg2svbSBU";

export const ESQUEMA = {
  Perfil: ["clave", "valor"],
  Resultados: ["fecha", "analito", "valor", "unidad", "ref_min", "ref_max", "laboratorio", "origen", "nota"],
  Indicadores: ["analito", "grupo", "orden", "que_mide", "si_alto", "si_bajo", "lectura", "nivel"],
  Examenes: ["fecha", "categoria", "titulo", "centro", "estado", "resumen", "link"],
  Diagnosticos: ["nombre", "area", "nivel", "desde", "medico", "resumen", "evidencia", "que_sigue"],
  Medicamentos: ["nombre", "dosis", "como", "desde", "hasta", "para_que", "estado", "nota"],
  Agenda: ["fecha", "tipo", "titulo", "detalle", "estado"],
  Preguntas: ["para", "pregunta", "estado"],
  Bitacora: ["fecha", "nota"],
  // Zonas del cuerpo de la pantalla de inicio. `zona` es una clave fija que la app
  // sabe ubicar (cerebro, ojos, oidos, tiroides, pulmones, corazon, higado, rinones, sangre,
  // digestivo, ingle, huesos); cualquier otra se muestra como etiqueta bajo la figura.
  Cuerpo: ["zona", "titulo", "nivel", "resumen", "que_sigue", "grupos"],
  Habitos: ["nombre", "icono", "nivel", "resumen", "meta", "detalle"],
  // Metas diarias. `id` es la clave corta que queda escrita en Registro: no cambiarla
  // después, o se pierde el historial de esa meta. meta_semanal = días por semana (1 a 7).
  Metas: ["id", "nombre", "icono", "grupo", "meta_semanal", "como", "por_que", "activo"],
  // Lo escribe la app: una fila por día con los ids cumplidos separados por coma.
  Registro: ["fecha", "cumplidas"],
  // Pestaña Revisión de la app (fichas sin metas diarias): conclusiones de la skill.
  Conclusiones: ["orden", "titulo", "nivel", "texto"],
  // Preguntas para la familia. La skill escribe id, para, pregunta y por_que;
  // la app escribe respuesta, respondido_por y fecha (columnas E a G).
  Familia: ["id", "para", "pregunta", "por_que", "respuesta", "respondido_por", "fecha"],
};

const sheets = google.sheets({ version: "v4", auth: getAuth() });

function aFilas(tab, objetos) {
  const cab = ESQUEMA[tab];
  if (!cab) throw new Error(`Pestaña desconocida: ${tab}. Válidas: ${Object.keys(ESQUEMA).join(", ")}`);
  return objetos.map((o, i) => {
    const sobran = Object.keys(o).filter((k) => !cab.includes(k));
    if (sobran.length) throw new Error(`${tab} fila ${i + 1}: columnas que no existen: ${sobran.join(", ")}`);
    return cab.map((c) => o[c] ?? "");
  });
}

const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf-8"));

async function crear() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const existentes = new Map(meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const requests = [];
  for (const tab of Object.keys(ESQUEMA)) {
    if (!existentes.has(tab)) requests.push({ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } });
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: Object.entries(ESQUEMA).map(([tab, cab]) => ({ range: `${tab}!A1`, values: [cab] })),
    },
  });

  // Encabezados en negrita y fila fija; se borra la hoja vacía que trae una planilla nueva.
  const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const formato = [];
  for (const s of meta2.data.sheets) {
    const { sheetId, title } = s.properties;
    if (!ESQUEMA[title]) {
      formato.push({ deleteSheet: { sheetId } });
      continue;
    }
    formato.push(
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.95, blue: 0.99 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      }
    );
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: formato } });
  console.log(`Pestañas listas: ${Object.keys(ESQUEMA).join(", ")}`);
}

async function leer(tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A1:Z`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const [cab, ...filas] = res.data.values || [[]];
  return filas.map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ""])));
}

async function agregar(tab, objetos) {
  const values = aFilas(tab, objetos);
  if (!values.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  console.log(`${tab}: +${values.length} filas`);
}

async function reemplazar(tab, objetos) {
  const values = aFilas(tab, objetos);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A2:Z` });
  if (values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A2`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }
  console.log(`${tab}: ${values.length} filas`);
}

const [, , cmd, a, b] = process.argv;
if (cmd === "crear") await crear();
else if (cmd === "leer") console.log(JSON.stringify(await leer(a), null, 1));
else if (cmd === "agregar") await agregar(a, leerJson(b));
else if (cmd === "reemplazar") await reemplazar(a, leerJson(b));
else if (cmd === "cargar") {
  for (const [tab, objetos] of Object.entries(leerJson(a))) await reemplazar(tab, objetos);
} else {
  console.log("Uso: node scripts/sheet.mjs crear | leer <Pestaña> | agregar <Pestaña> <json> | reemplazar <Pestaña> <json> | cargar <json>");
  process.exit(1);
}
