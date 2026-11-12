import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("public", { recursive: true });
const html = (await readFile("index.html", "utf8"))
  .replace('id="comunidad"', 'id="comunidad" data-community-live')
  .replace(/<div class="demo">[^\n]+<\/div>/, '<p id="community-status" role="status"></p>')
  .replace('id="session" class="secondary">Probar como ganador', 'id="session" class="secondary" disabled>Ingresar con Kick')
  .replace('Entrá como ganador de ejemplo para ver y reclamar tu tipeo de prueba.', 'Ingresá con Kick para ver tus tipeos.')
  .replace('Activo si escribió en los últimos 15 minutos de la sesión de prueba.', 'Ranking de las últimas 24 horas. Activo si escribió en los últimos 15 minutos.')
  .replace('id="panel"', 'id="panel" hidden')
  .replace('Panel de moderación de prueba', 'Panel de moderación')
  .replaceAll('Usuario de prueba', 'Usuario de Kick')
  .replace(' value="pingui_demo"', '')
  .replace('</body>', '<script src="/community-live.js" defer></script>\n</body>');
await writeFile("public/index.html", html);
await copyFile("community-live.js", "public/community-live.js");
try {
  await copyFile("torneo.html", "public/torneo.html");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
