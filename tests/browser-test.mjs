// Abre o jogo em navegador headless e captura erros de console/página.
// Rodar da raiz do projeto: npm run test:browser
// Alvo alternativo: GAME_URL=http://127.0.0.1:5180/ para testar o dist/.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const shot = (name) => path.join(HERE, name);

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) {
  console.error("Nenhum Chrome/Edge encontrado");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1280,800",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    errors.push(`[console.${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) =>
  errors.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`)
);

const BASE = process.env.GAME_URL || "http://127.0.0.1:5173/";
await page.goto(BASE + "?v=" + Date.now(), { waitUntil: "networkidle2" });

// espera o Game existir (splash/skin não bloqueiam o construct)
await page.waitForFunction(() => window.__game?.world?.minimapCanvas, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));

// pula skin picker se estiver aberto
await page.evaluate(() => {
  const btn = document.getElementById("skin-confirm");
  const picker = document.getElementById("skin-picker");
  if (btn && picker && !picker.hidden) btn.click();
});
await new Promise((r) => setTimeout(r, 500));

const state = await page.evaluate(() => {
  const g = window.__game;
  return {
    bootErr: (() => {
      const el = document.getElementById("boot-error");
      return el && !el.hidden ? el.textContent : null;
    })(),
    hudHidden: document.getElementById("hud")?.hidden,
    time: document.getElementById("time-of-day")?.textContent,
    items: document.getElementById("items-info")?.textContent,
    hasGame: !!g,
    gameState: g?.state ?? null,
    bear: g?.world?.bear?.state ?? null,
    itemCount: g?.world?.items?.length ?? null,
    hasMinimap: !!g?.world?.minimapCanvas,
  };
});

console.log("STATE:", JSON.stringify(state));
if (!state.hasGame || !state.hasMinimap) {
  console.error("Game/minimap não carregou");
  await browser.close();
  process.exit(1);
}

// minimapa: gira com yaw e seta fica no centro
const minimapCheck = await page.evaluate(() => {
  const g = window.__game;
  const canvas = document.getElementById("minimap");
  if (!canvas) return { ok: false, err: "sem #minimap" };
  const sample = () => {
    g.drawMinimap();
    const ctx = canvas.getContext("2d");
    const mid = ctx.getImageData(90, 90, 1, 1).data;
    // seta branca no centro → canais altos
    return mid[0] + mid[1] + mid[2];
  };
  g.player.yaw = 0;
  const bright0 = sample();
  g.player.yaw = Math.PI / 2;
  const bright90 = sample();
  g.player.yaw = Math.PI;
  sample();
  if (bright0 < 400 || bright90 < 400) {
    return { ok: false, err: `seta fraca no centro: ${bright0}/${bright90}` };
  }
  return { ok: true, bright0, bright90 };
});
console.log("MINIMAP:", JSON.stringify(minimapCheck));
if (!minimapCheck.ok) {
  console.error("MINIMAP FAIL:", minimapCheck.err);
  await browser.close();
  process.exit(1);
}

// dispara efeitos sonoros (não falha o teste se áudio bloquear)
const audioResult = await page.evaluate(async () => {
  const g = window.__game;
  try {
    g.ambience.start();
    for (const fn of ["pickup", "discover", "deposit", "hurt", "growl", "bearHit", "victory", "wolfHowl"]) {
      g.ambience[fn]?.();
    }
    g.ambience.roarSmall?.(0.8);
    g.ambience.heartbeat?.(0.5);
    g.ambience.stepSnow?.(false);
    g.ambience.stepIce?.(true);
    await new Promise((r) => setTimeout(r, 300));
    return "audio OK, started=" + g.ambience.started;
  } catch (e) {
    return "audio FAIL: " + e.message;
  }
});
console.log("AUDIO:", audioResult);
console.log("ERRORS:", errors.length ? errors.join("\n") : "(nenhum)");

await page.screenshot({ path: shot("browser-test.png") });
console.log("screenshot: tests/browser-test.png");

// 3ª pessoa: vira a câmera um pouco e fotografa o personagem
await page.evaluate(() => {
  const g = window.__game;
  g.setCameraMode("third");
  g.player.pitch = -0.25;
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: shot("browser-test-3p.png") });
console.log("screenshot: tests/browser-test-3p.png");

// teleporta para perto do urso (se já spawnou) e fotografa
await page.evaluate(() => {
  const g = window.__game;
  const b = g.world.bear?.mesh?.position;
  if (!b) return;
  g.player.position.set(b.x - 5, g.world.groundHeight(b.x - 5, b.z - 5), b.z - 5);
  g.player.yaw = Math.atan2(-(b.x - g.player.position.x), -(b.z - g.player.position.z));
  g.player.pitch = -0.1;
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: shot("browser-test-bear.png") });
console.log("screenshot: tests/browser-test-bear.png");
await browser.close();
console.log("BROWSER OK — minimapa validado");
