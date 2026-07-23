import * as THREE from "three";

// Texturas procedurais desenhadas em canvas — nenhum arquivo externo.
// As bases são quase brancas para serem tingidas pela cor do material.

const HAS_DOM = typeof document !== "undefined";
const SIZE = 256;

function blank(fill) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d");
  g.fillStyle = fill;
  g.fillRect(0, 0, SIZE, SIZE);
  return [c, g];
}

function speckle(g, count, colors, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = aMin + Math.random() * (aMax - aMin);
    const r = rMin + Math.random() * (rMax - rMin);
    g.beginPath();
    g.arc(Math.random() * SIZE, Math.random() * SIZE, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function toTexture(canvas, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function snowGroundCanvas() {
  const [c, g] = blank("#f1f5fa");
  // manchas suaves de sombra azulada (neve acumulada de forma irregular)
  speckle(g, 60, ["#ccd9e8", "#d8e2ee"], 0.05, 0.12, 12, 34);
  // grãos finos
  speckle(g, 2600, ["#dfe8f2", "#cfdcea", "#ffffff", "#c2d2e2"], 0.1, 0.3, 0.4, 1.4);
  // cristais que cintilam
  speckle(g, 140, ["#ffffff"], 0.75, 1, 0.4, 0.9);
  return c;
}

function snowSoftCanvas() {
  const [c, g] = blank("#f4f8fc");
  speckle(g, 1200, ["#e2eaf2", "#d4e0ec", "#ffffff"], 0.12, 0.3, 0.5, 1.6);
  speckle(g, 60, ["#ffffff"], 0.8, 1, 0.4, 0.8);
  return c;
}

function iceCanvas() {
  const [c, g] = blank("#c2dcee");
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 20, SIZE / 2, SIZE / 2, SIZE * 0.7);
  grad.addColorStop(0, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(90,130,170,0.2)");
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  speckle(g, 500, ["#dcecf8", "#a8c8e0", "#ffffff"], 0.08, 0.2, 0.6, 2.2);
  // rachaduras: linhas quebradas finas
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(70,105,140,0.4)";
    g.lineWidth = 0.6 + Math.random() * 0.9;
    g.beginPath();
    let x = Math.random() * SIZE;
    let y = Math.random() * SIZE;
    g.moveTo(x, y);
    const segs = 4 + ((Math.random() * 5) | 0);
    let ang = Math.random() * Math.PI * 2;
    for (let s = 0; s < segs; s++) {
      ang += (Math.random() - 0.5) * 1.2;
      const len = 12 + Math.random() * 30;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function barkCanvas() {
  const [c, g] = blank("#e4dcd2");
  // estrias verticais onduladas (casca)
  for (let i = 0; i < 46; i++) {
    const x0 = Math.random() * SIZE;
    g.strokeStyle = `rgba(52,36,22,${0.15 + Math.random() * 0.3})`;
    g.lineWidth = 1 + Math.random() * 2.6;
    g.beginPath();
    g.moveTo(x0, -6);
    for (let y = 0; y <= SIZE + 6; y += 14) {
      g.lineTo(x0 + Math.sin(y * 0.06 + i) * 4 + (Math.random() - 0.5) * 3, y);
    }
    g.stroke();
  }
  // nós da madeira
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    g.strokeStyle = "rgba(40,26,14,0.4)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(x, y, 3 + Math.random() * 4, 6 + Math.random() * 6, 0, 0, Math.PI * 2);
    g.stroke();
  }
  speckle(g, 500, ["#5a4230", "#f2ece4"], 0.05, 0.15, 0.5, 1.5);
  return c;
}

function plankCanvas() {
  const [c, g] = blank("#e8dfd2");
  const board = SIZE / 4;
  for (let b = 0; b < 4; b++) {
    const y = b * board;
    // sombra entre tábuas
    g.fillStyle = "rgba(45,30,18,0.55)";
    g.fillRect(0, y, SIZE, 2.5);
    // veios da madeira
    for (let i = 0; i < 9; i++) {
      const gy = y + 6 + Math.random() * (board - 10);
      g.strokeStyle = `rgba(90,64,40,${0.1 + Math.random() * 0.18})`;
      g.lineWidth = 0.8 + Math.random() * 1.4;
      g.beginPath();
      g.moveTo(-4, gy);
      for (let x = 0; x <= SIZE + 4; x += 18) {
        g.lineTo(x, gy + Math.sin(x * 0.05 + b * 2 + i) * 2.2);
      }
      g.stroke();
    }
    // pregos nas pontas
    g.fillStyle = "rgba(30,24,18,0.7)";
    g.beginPath();
    g.arc(10, y + board / 2, 1.8, 0, Math.PI * 2);
    g.arc(SIZE - 10, y + board / 2, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 350, ["#6b4c32", "#f4ede2"], 0.04, 0.12, 0.5, 1.4);
  return c;
}

function rockCanvas() {
  const [c, g] = blank("#dcdcdc");
  // manchas grandes de tons diferentes
  speckle(g, 40, ["#b8b8bc", "#c8c8cc", "#a8a8ae"], 0.12, 0.28, 8, 26);
  // granulado
  speckle(g, 2200, ["#8f8f96", "#f0f0f2", "#b0b0b6"], 0.08, 0.26, 0.4, 1.6);
  // fissuras
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = "rgba(60,60,66,0.35)";
    g.lineWidth = 0.7 + Math.random() * 0.8;
    g.beginPath();
    let x = Math.random() * SIZE;
    let y = Math.random() * SIZE;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function foliageCanvas() {
  const [c, g] = blank("#e0e6e0");
  // agulhas de pinheiro: tracinhos em ângulos variados
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const a = Math.random() * Math.PI;
    const len = 3 + Math.random() * 5;
    g.strokeStyle = Math.random() < 0.7 ? `rgba(30,60,40,${0.15 + Math.random() * 0.25})` : `rgba(240,248,244,${0.2 + Math.random() * 0.2})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

function furCanvas() {
  const [c, g] = blank("#e2dad2");
  // pelos curtos, todos meio inclinados na mesma direção
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.9;
    const len = 4 + Math.random() * 6;
    g.strokeStyle = Math.random() < 0.65 ? `rgba(45,30,18,${0.12 + Math.random() * 0.22})` : `rgba(245,238,230,${0.1 + Math.random() * 0.18})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/** Caixa de suprimentos — madeira + tiras. */
function crateCanvas() {
  const [c, g] = blank("#c8a878");
  // tábuas
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * SIZE;
    g.fillStyle = i % 2 === 0 ? "rgba(90,60,30,0.18)" : "rgba(255,240,210,0.12)";
    g.fillRect(0, y, SIZE, SIZE / 6);
    g.strokeStyle = "rgba(40,24,10,0.35)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(SIZE, y);
    g.stroke();
  }
  // cantoneiras
  g.fillStyle = "rgba(50,40,30,0.55)";
  g.fillRect(0, 0, 14, SIZE);
  g.fillRect(SIZE - 14, 0, 14, SIZE);
  g.fillRect(0, 0, SIZE, 14);
  g.fillRect(0, SIZE - 14, SIZE, 14);
  // pregos
  for (const [x, y] of [
    [18, 18],
    [SIZE - 18, 18],
    [18, SIZE - 18],
    [SIZE - 18, SIZE - 18],
  ]) {
    g.fillStyle = "rgba(30,28,24,0.8)";
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 400, ["#6a4420", "#f0e0c8"], 0.06, 0.16, 0.5, 1.5);
  return c;
}

/** Metal escovado / lata. */
function metalCanvas() {
  const [c, g] = blank("#b8c0c8");
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * SIZE;
    g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
    g.lineWidth = 0.6 + Math.random();
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(SIZE, y + (Math.random() - 0.5) * 4);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * SIZE;
    g.strokeStyle = `rgba(20,28,36,${0.06 + Math.random() * 0.12})`;
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(SIZE, y);
    g.stroke();
  }
  speckle(g, 180, ["#6a7480", "#e8eef2"], 0.08, 0.2, 0.6, 2.2);
  // rebites
  for (let i = 0; i < 12; i++) {
    const x = 20 + (i % 4) * 60;
    const y = 24 + ((i / 4) | 0) * 70;
    g.fillStyle = "rgba(40,48,56,0.55)";
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(220,230,240,0.35)";
    g.beginPath();
    g.arc(x - 1, y - 1, 1.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Lona / tecido para kits e mapas. */
function clothCanvas() {
  const [c, g] = blank("#d8c8a8");
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(80,60,40,${0.05 + Math.random() * 0.1})`;
    g.lineWidth = 0.5;
    const y = (i / 40) * SIZE;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 12) {
      g.lineTo(x, y + Math.sin(x * 0.08 + i) * 1.5);
    }
    g.stroke();
  }
  // costura
  g.setLineDash([4, 6]);
  g.strokeStyle = "rgba(60,40,24,0.35)";
  g.lineWidth = 1.2;
  g.strokeRect(18, 18, SIZE - 36, SIZE - 36);
  g.setLineDash([]);
  speckle(g, 500, ["#8a6a40", "#f4ead8"], 0.05, 0.14, 0.4, 1.2);
  return c;
}

/** Facetas de cristal / gelo para troféus. */
function crystalCanvas() {
  const [c, g] = blank("#e8f4ff");
  for (let i = 0; i < 18; i++) {
    g.fillStyle =
      i % 2 === 0 ? "rgba(120,180,220,0.22)" : "rgba(255,255,255,0.28)";
    g.beginPath();
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    g.moveTo(x, y);
    g.lineTo(x + 40 + Math.random() * 60, y + 10);
    g.lineTo(x + 20, y + 50 + Math.random() * 40);
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = 0.8;
    g.beginPath();
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    g.moveTo(x, y);
    g.lineTo(x + 8 + Math.random() * 20, y + 20 + Math.random() * 30);
    g.stroke();
  }
  speckle(g, 200, ["#ffffff", "#a8d0f0"], 0.15, 0.4, 0.4, 1.2);
  return c;
}

export function makeTextures() {
  if (!HAS_DOM) return {}; // smoke test em Node não tem canvas

  const snowGround = snowGroundCanvas();
  const snowSoft = snowSoftCanvas();
  const ice = iceCanvas();
  const bark = barkCanvas();
  const plank = plankCanvas();
  const rock = rockCanvas();
  const foliage = foliageCanvas();
  const fur = furCanvas();
  const crate = crateCanvas();
  const metal = metalCanvas();
  const cloth = clothCanvas();
  const crystal = crystalCanvas();

  return {
    snowGround: toTexture(snowGround, 46),
    snowGroundBump: toTexture(snowGround, 46, false),
    snow: toTexture(snowSoft, 2),
    ice: toTexture(ice, 14),
    iceBump: toTexture(ice, 14, false),
    bark: toTexture(bark, 1),
    barkBump: toTexture(bark, 1, false),
    plank: toTexture(plank, 1),
    plankBump: toTexture(plank, 1, false),
    rock: toTexture(rock, 1.5),
    rockBump: toTexture(rock, 1.5, false),
    foliage: toTexture(foliage, 2),
    fur: toTexture(fur, 2),
    crate: toTexture(crate, 1),
    crateBump: toTexture(crate, 1, false),
    metal: toTexture(metal, 1),
    metalBump: toTexture(metal, 1, false),
    cloth: toTexture(cloth, 1),
    clothBump: toTexture(cloth, 1, false),
    crystal: toTexture(crystal, 1),
  };
}
