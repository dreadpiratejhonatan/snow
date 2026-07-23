// Gera dist/ (bundle único) + release/hostgator-snow/ pronto para a HostGator.
// A HostGator bloqueia pastas vendor/lib — por isso tudo vai num game.js / bundle.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIST = "dist";
const HOST = path.join("release", "hostgator-snow");
const CACHE = "gh8";

/**
 * Copia data/ para o destino.
 * omitLeaderboard: true no pacote HostGator — o zip NÃO leva leaderboard.json
 * (upload não pode apagar o ranking do servidor).
 */
function copyDataDir(destRoot, { omitLeaderboard = false } = {}) {
  const srcDir = "data";
  const destDir = path.join(destRoot, "data");
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(srcDir)) {
    for (const name of fs.readdirSync(srcDir)) {
      const from = path.join(srcDir, name);
      const to = path.join(destDir, name);
      if (!fs.statSync(from).isFile()) continue;
      if (name === "leaderboard.json") {
        if (omitLeaderboard) continue;
        if (fs.existsSync(to)) {
          console.log(`PRESERVE ranking: ${to}`);
          continue;
        }
      }
      fs.copyFileSync(from, to);
    }
  }
  fs.writeFileSync(
    path.join(destDir, "leaderboard.example.json"),
    JSON.stringify({ entries: [] }, null, 2) + "\n"
  );
  const lb = path.join(destDir, "leaderboard.json");
  if (!omitLeaderboard && !fs.existsSync(lb)) {
    fs.writeFileSync(lb, JSON.stringify({ entries: [] }, null, 2) + "\n");
    console.log(`SEED ranking vazio: ${lb}`);
  }
  if (omitLeaderboard) {
    console.log("HostGator package: data/ sem leaderboard.json (ranking do servidor intacto)");
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "styles"), { recursive: true });

fs.copyFileSync("src/styles/styles.css", path.join(DIST, "styles", "styles.css"));

execSync(
  "npx esbuild src/js/main.js --bundle --format=esm --outfile=dist/game.js --minify --legal-comments=none",
  { stdio: "inherit" }
);

let html = fs.readFileSync("index.html", "utf8");
html = html
  .replace(/<link rel="stylesheet" href="src\/styles\/styles\.css" \/>/, '<link rel="stylesheet" href="styles/styles.css" />')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "")
  .replace(
    /<script type="module" src="src\/js\/main\.js\?v=[^"]*"><\/script>/,
    `<script type="module" src="game.js?v=${CACHE}"></script>`
  );
fs.writeFileSync(path.join(DIST, "index.html"), html);

for (const splash of ["splash_screen.png", "splash_screen.jpeg"]) {
  if (fs.existsSync(splash)) fs.copyFileSync(splash, path.join(DIST, splash));
}
if (fs.existsSync("music")) {
  fs.cpSync("music", path.join(DIST, "music"), { recursive: true });
}
if (fs.existsSync("api")) {
  fs.cpSync("api", path.join(DIST, "api"), { recursive: true });
}
copyDataDir(DIST);

fs.writeFileSync(
  path.join(DIST, ".htaccess"),
  [
    "AddType text/javascript .js .mjs",
    "<IfModule mod_headers.c>",
    '  <FilesMatch "\\.(html)$">',
    '    Header set Cache-Control "no-cache"',
    "  </FilesMatch>",
    "</IfModule>",
    "",
  ].join("\n")
);

// GitHub Pages: evita que o Jekyll ignore pastas/arquivos
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
// Nota amigável no dist (ranking PHP não roda no Pages)
fs.writeFileSync(
  path.join(DIST, "GITHUB-PAGES.txt"),
  [
    "Neve Selvagem — build estático (GitHub Pages)",
    "",
    "O jogo roda 100% no browser.",
    "Ranking online: chama a API PHP da HostGator (CORS).",
    "Tecla T abre a lista Top 10. Fallback: localStorage.",
    "Co-op 2P: signaling em api/signal.php (HostGator) + WebRTC P2P.",
    "",
  ].join("\n")
);

fs.rmSync(HOST, { recursive: true, force: true });
fs.mkdirSync(path.join(HOST, "src", "js"), { recursive: true });
fs.mkdirSync(path.join(HOST, "src", "styles"), { recursive: true });
fs.copyFileSync(path.join(DIST, "game.js"), path.join(HOST, "src", "js", "bundle.js"));
fs.copyFileSync("src/styles/styles.css", path.join(HOST, "src", "styles", "styles.css"));
for (const splash of ["splash_screen.png", "splash_screen.jpeg"]) {
  if (fs.existsSync(splash)) fs.copyFileSync(splash, path.join(HOST, splash));
}
if (fs.existsSync("music")) {
  fs.cpSync("music", path.join(HOST, "music"), { recursive: true });
}
if (fs.existsSync("api")) {
  fs.cpSync("api", path.join(HOST, "api"), { recursive: true });
}
copyDataDir(HOST, { omitLeaderboard: true });
const roomsHost = path.join(HOST, "data", "rooms");
fs.mkdirSync(roomsHost, { recursive: true });
if (fs.existsSync("data/rooms/.htaccess")) {
  fs.copyFileSync("data/rooms/.htaccess", path.join(roomsHost, ".htaccess"));
}

let hostHtml = fs.readFileSync("index.html", "utf8");
hostHtml = hostHtml
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "")
  .replace(
    /<script type="module" src="src\/js\/main\.js\?v=[^"]*"><\/script>/,
    `<script type="module" src="src/js/bundle.js?v=${CACHE}"></script>`
  );
fs.writeFileSync(path.join(HOST, "index.html"), hostHtml);

fs.writeFileSync(
  path.join(HOST, "LEIA-ME.txt"),
  [
    "Neve Selvagem — upload HostGator (PRESERVA O RANKING)",
    "",
    "*** NAO APAGUE a pasta data/ no servidor ***",
    "*** NAO sobrescreva data/leaderboard.json ***",
    "",
    "1. No cPanel, abra public_html/snow",
    "2. BACKUP: baixe data/leaderboard.json para o PC",
    "3. Apague SOMENTE: index.html, src/, api/, music/, splash_screen.*",
    "   (deixe data/ intacta)",
    "4. Upload deste pacote (index.html + splash + src/ + api/ + music/)",
    "   Se o zip trouxer data/, nao substitua leaderboard.json existente",
    "5. Permissao data/ e data/rooms/ = 755 ou 775",
    "6. Site + Ctrl+F5 (cache ?v=" + CACHE + ")",
    "",
    "Ajuda in-game: tecla H ou botao ?",
    "Ranking: api/leaderboard.php -> data/leaderboard.json",
    "Co-op: api/signal.php -> data/rooms/ (ver docs/COOP.md)",
    "Guia completo: DEPLOY-SEGURO.md no repositorio",
    "",
  ].join("\n")
);

const zipPath = path.join("release", "snow.zip");
if (process.platform === "win32") {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `powershell -Command "Compress-Archive -Path '${HOST.replace(/\\/g, "/")}/*' -DestinationPath '${zipPath.replace(/\\/g, "/")}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  // GitHub Actions / Linux: dist/ já basta para Pages; zip HostGator é opcional
  console.log("Skip release/snow.zip (PowerShell só no Windows)");
}

const sizeMb = (fs.statSync(path.join(DIST, "game.js")).size / (1024 * 1024)).toFixed(2);
console.log(`BUILD OK — game.js ${sizeMb} MB`);
console.log(`HostGator: ${HOST}/` + (process.platform === "win32" ? "  e  release/snow.zip" : ""));
