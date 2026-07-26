/**
 * Gera WAVs ambient curtos (domínio público / original) para music/.
 * Uso: node scripts/gen-ambient-music.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "music");
fs.mkdirSync(outDir, { recursive: true });

const SR = 22050;
const tracks = [
  { file: "campo-branco.wav", name: "Campo Branco", freqs: [110, 164.81, 196], secs: 18, drift: 0.3 },
  { file: "bafo-de-gelo.wav", name: "Bafo de Gelo", freqs: [98, 146.83, 185], secs: 16, drift: 0.22 },
  { file: "neblina-quieta.wav", name: "Neblina Quieta", freqs: [82.41, 123.47, 174.61], secs: 20, drift: 0.18 },
];

function writeWav(filePath, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function renderTrack({ freqs, secs, drift }) {
  const n = Math.floor(SR * secs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env =
      Math.min(1, t / 2.5) *
      Math.min(1, (secs - t) / 3) *
      (0.55 + 0.45 * Math.sin(t * drift));
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k] * (1 + 0.004 * Math.sin(t * (0.07 + k * 0.03)));
      s += Math.sin(2 * Math.PI * f * t) * (0.12 / (k + 1));
      // harmônico bem baixo
      s += Math.sin(2 * Math.PI * f * 2 * t) * (0.02 / (k + 1));
    }
    // nota rara ocasional
    if (Math.sin(t * 0.37) > 0.992) {
      s += Math.sin(2 * Math.PI * freqs[0] * 2 * t) * 0.08 * env;
    }
    out[i] = s * env * 0.55;
  }
  return out;
}

const manifest = [];
for (const tr of tracks) {
  const samples = renderTrack(tr);
  const fp = path.join(outDir, tr.file);
  writeWav(fp, samples);
  manifest.push(tr.file);
  console.log("OK", tr.file, `${(fs.statSync(fp).size / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest.json", manifest);
