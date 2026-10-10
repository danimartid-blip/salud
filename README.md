# Mi Salud

Tablero personal para seguir exámenes médicos: indicadores con su rango de
referencia y evolución, exámenes ordenados por fecha, diagnósticos, medicamentos
y el plan de controles. Se puede instalar en el celular como app.

## Cómo funciona

- Sitio estático (GitHub Pages), sin backend.
- Los datos viven en una planilla privada de Google Sheets. La app los lee en
  vivo con el login de Google del propio usuario (solo lectura).
- **Este repositorio no contiene ningún dato de salud**: solo el código.

## Pestañas de la planilla

`Perfil`, `Resultados`, `Indicadores`, `Examenes`, `Diagnosticos`,
`Medicamentos`, `Agenda`, `Preguntas`, `Bitacora`. Las columnas de cada una
están en `scripts/sheet.mjs`.

## Publicar un cambio

Actualizar `?v=AAAAMMDDHHMM` en `index.html` y `login.html` (el celular cachea
agresivo), y después `git add -A && git commit && git push`.
