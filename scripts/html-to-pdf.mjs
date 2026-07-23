// Gera PDF a partir de um HTML (Chrome/Edge headless).
// Uso: node scripts/html-to-pdf.mjs docs/release-notes-jul2026.html release/Neve-Selvagem-Release-Notes-jul2026.pdf
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const htmlRel = process.argv[2] || "docs/release-notes-jul2026.html";
const pdfRel =
  process.argv[3] || "release/Neve-Selvagem-Release-Notes-jul2026.pdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.resolve(root, htmlRel);
const pdfPath = path.resolve(root, pdfRel);

if (!fs.existsSync(htmlPath)) {
  console.error("HTML não encontrado:", htmlPath);
  process.exit(1);
}

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) {
  console.error("Chrome/Edge não encontrado");
  process.exit(1);
}

fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--font-render-hinting=none"],
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  // espera fontes do Google
  await page.evaluateHandle("document.fonts.ready");
  await new Promise((r) => setTimeout(r, 400));
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
  });
  console.log("PDF OK:", pdfPath);
} finally {
  await browser.close();
}
