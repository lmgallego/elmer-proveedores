# elmer-proveedores
App web 100% cliente para cruzar tarifas de proveedores contra la base de datos de Elmer Automoción.

## Stack
- HTML/CSS/JS vanilla, sin build system, sin bundler
- Tailwind CSS por CDN, SheetJS (XLSX) por CDN
- NO usar import/export ES modules — usar window.XXX para exponer objetos globales

## Arquitectura — Patrón Strategy
Cada proveedor es un archivo en /js/providers/ que expone window.XxxProvider con método process(rawElmer, rawTarifa) que devuelve: { providerName, cruzados, soloElmer, soloProveedor, columns }

## Estructura
index.html / css/styles.css / js/main.js / js/engine.js / js/providers/

## Probar
Abrir index.html directamente en navegador. Sin servidor ni test runner.

## Normas
- Sin emojis en ningún sitio: UI, mensajes, nombres de hojas Excel, comentarios de código
