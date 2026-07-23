// Playlist estilo Minecraft: cada vez que o jogo inicia, embaralha as faixas.
//
// 1) Se existirem arquivos em /music/*.mp3 (ou .ogg), eles têm prioridade.
//    Coloque aí as músicas do Minecraft que VOCÊ tiver direito de usar.
// 2) Senão, toca faixas procedurais bem distintas (estilo C418 / exploração).
//
// Não embutimos a OST oficial do Minecraft — é protegida por copyright.

const FILE_CANDIDATES = [
  // nomes comuns da OST (só tocam se o arquivo existir na pasta music/)
  "sweden.mp3",
  "sweden.ogg",
  "key.mp3",
  "key.ogg",
  "subwoofer-lullaby.mp3",
  "subwoofer_lullaby.mp3",
  "living-mice.mp3",
  "living_mice.mp3",
  "haggstrom.mp3",
  "minecraft.mp3",
  "clark.mp3",
  "wet-hands.mp3",
  "wet_hands.mp3",
  "dry-hands.mp3",
  "mice-on-venus.mp3",
  "alpha.mp3",
  "beta.mp3",
];

// Motivos em graus da escala (não é a OST oficial — clima C418 / exploração).
const MOTIFS = [
  [0, 2, 4, 5, 4, 2], // subida suave e volta
  [4, 2, 0, 2, 4, 5], // desce e sobe
  [0, 0, 2, 4, -1, 5], // nota longa + pausa
  [2, 4, 5, 4, 2, 0], // arco clássico
  [5, 4, 2, 0, 2, -1], // desce e respira
  [0, 4, 5, 4, -1, 2], // salto de 3ª/5ª suave
  [2, 2, 4, 5, 7, 5], // sobe (graus saturam na escala)
  [0, 2, -1, 4, 2, 0], // silêncio no meio
];

// Faixas procedurais estilo Minecraft / C418: piano lento + pad quente.
const PROC_TRACKS = [
  {
    id: "sweden-main",
    name: "Planície Quiet",
    // C major pentatônico-ish (C D E G A) — clima Sweden / exploração
    scale: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25],
    pad: [130.81, 164.81, 196.0, 261.63],
    beat: 1.35,
    density: 0.82,
    bright: 0.08,
    length: 36,
  },
  {
    id: "key-soft",
    name: "Chave na Neve",
    scale: [220.0, 246.94, 261.63, 293.66, 329.63, 369.99],
    pad: [110.0, 146.83, 174.61, 220.0],
    beat: 1.4,
    density: 0.78,
    bright: 0.06,
    length: 28,
  },
  {
    id: "haggstrom-soft",
    name: "Haggström Quiet",
    scale: [196.0, 220.0, 246.94, 293.66, 329.63, 392.0],
    pad: [98.0, 123.47, 146.83, 196.0],
    beat: 1.2,
    density: 0.8,
    bright: 0.1,
    length: 30,
  },
  {
    id: "living-mice",
    name: "Ratos Vivos",
    scale: [174.61, 196.0, 220.0, 261.63, 293.66, 349.23],
    pad: [87.31, 130.81, 174.61, 220.0],
    beat: 1.45,
    density: 0.76,
    bright: 0.08,
    length: 26,
  },
  {
    id: "wet-hands",
    name: "Mãos Molhadas",
    scale: [146.83, 174.61, 196.0, 220.0, 261.63, 293.66],
    pad: [73.42, 110.0, 146.83, 185.0],
    beat: 1.5,
    density: 0.75,
    bright: 0.05,
    length: 28,
  },
  {
    id: "subwoofer",
    name: "Canção do Subwoofer",
    scale: [130.81, 155.56, 174.61, 196.0, 233.08, 261.63],
    pad: [65.41, 98.0, 130.81, 164.81],
    beat: 1.55,
    density: 0.75,
    bright: 0.04,
    length: 30,
  },
  {
    id: "mice-venus",
    name: "Ratos em Vênus",
    scale: [246.94, 277.18, 293.66, 349.23, 392.0, 440.0],
    pad: [123.47, 155.56, 185.0, 246.94],
    beat: 1.3,
    density: 0.78,
    bright: 0.12,
    length: 28,
  },
];

function randInt(n) {
  if (n <= 0) return 0;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  }
  return (Math.random() * n) | 0;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Embaralha e escolhe índice inicial ≠ da última sessão (se possível). */
function freshPlaylist(tracks, idKey = "id") {
  const list = shuffle(tracks);
  let start = randInt(list.length);
  try {
    const last = sessionStorage.getItem("neveMusicLast");
    if (last && list.length > 1) {
      const same = list[start][idKey] === last || list[start].name === last;
      if (same) start = (start + 1 + randInt(list.length - 1)) % list.length;
    }
    const pick = list[start];
    sessionStorage.setItem("neveMusicLast", pick[idKey] || pick.name || "");
  } catch {
    /* private mode */
  }
  return { list, start };
}

async function probeUrl(url) {
  try {
    // Range evita baixar o mp3 inteiro; alguns hosts não aceitam HEAD
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-64" },
      cache: "no-store",
    });
    if (!(res.ok || res.status === 206)) return false;
    // HostGator às vezes devolve HTML 200 para path inexistente
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("text/plain") || ct.includes("application/json")) {
      return false;
    }
    // só aceita áudio real (evita soft-404 que silencia a trilha procedural)
    if (!(ct.includes("audio/") || ct.includes("application/ogg") || ct.includes("application/octet-stream"))) {
      return false;
    }
    // rejeita respostas minúsculas / vazias
    const cl = Number(res.headers.get("content-length") || 0);
    if (cl > 0 && cl < 500) return false;
    // sniff: HTML começa com < ! ou <h
    const buf = await res.arrayBuffer();
    if (buf.byteLength >= 1) {
      const b0 = new Uint8Array(buf)[0];
      if (b0 === 0x3c /* < */) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class MusicPlayer {
  constructor(getCtx, getMaster) {
    this.getCtx = getCtx;
    this.getMaster = getMaster;
    this.ready = false;
    this.mode = "proc"; // 'file' | 'proc'
    this.playlist = [];
    this.index = 0;
    this.fileAudio = null;
    this.onTrack = null; // (name) => void
    this.mood = "explore"; // explore | combat
    this._moodBlend = 0; // 0 explore → 1 combat

    // procedural state
    this.bus = null;
    this.combatBus = null;
    this.padGain = null;
    this.padFilter = null;
    this.padOsc = [];
    this.echo = null;
    this.queue = [];
    this.timer = 0;
    this.silence = 0;
    this.track = null;
    this.beat = 0.55;
    this.notesLeftInTrack = 0;
    this._combatPulse = 0;
  }

  async start() {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master || this.ready) return;

    if (ctx.state === "suspended") ctx.resume();
    this.bus = ctx.createGain();
    // Presente o bastante para ouvir no celular (ainda suave)
    this.bus.gain.value = 0.65;
    this.bus.connect(master);

    // camada de tensão (combate) — some por cima da exploração
    this.combatBus = ctx.createGain();
    this.combatBus.gain.value = 0;
    this.combatBus.connect(master);
    this.setupCombatLayer(ctx);

    // 1) Playlist procedural aleatória (embaralha a cada entrada)
    this.mode = "proc";
    this.setupProcGraph(ctx);
    const proc = freshPlaylist(PROC_TRACKS, "id");
    this.playlist = proc.list;
    this.index = proc.start;
    this.beginProcTrack(this.playlist[this.index]);
    this.ready = true;
    this.onTrack?.(this.playlist[this.index]?.name || "Trilha");

    // 2) Em segundo plano: só troca se houver áudio VÁLIDO (não soft-404 HTML)
    const files = await this.discoverFiles();
    if (files.length > 0) {
      const filePl = freshPlaylist(
        files.map((f) => ({ ...f, id: f.url })),
        "id"
      );
      // testa play do primeiro; se falhar, mantém procedural
      const ok = await this.trySwitchToFiles(filePl);
      if (!ok) {
        console.warn("Music: arquivos inválidos — mantendo trilha procedural");
      }
    }
  }

  /** Troca para arquivos só se o primeiro tocar de verdade. */
  trySwitchToFiles(filePl) {
    return new Promise((resolve) => {
      const entry = filePl.list[filePl.start];
      if (!entry) {
        resolve(false);
        return;
      }
      const audio = new Audio(entry.url);
      audio.volume = 0.5;
      audio.preload = "auto";
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        resolve(false);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        this.mode = "file";
        this.playlist = filePl.list;
        this.index = filePl.start;
        this.muteProcPad();
        this.queue = [];
        this.notesLeftInTrack = 0;
        this.silence = 0;
        this._pendingNext = false;
        if (this.fileAudio) {
          try {
            this.fileAudio.pause();
          } catch {
            /* ignore */
          }
        }
        this.fileAudio = audio;
        this.onTrack?.(entry.name);
        audio.onended = () => this.nextAfterSilence(2 + Math.random() * 3);
        resolve(true);
      };
      audio.addEventListener("error", fail, { once: true });
      audio.addEventListener("playing", ok, { once: true });
      setTimeout(fail, 4000);
      audio.play().catch(fail);
    });
  }

  muteProcPad() {
    if (!this.padOsc) return;
    const ctx = this.getCtx();
    const t = ctx?.currentTime || 0;
    for (const p of this.padOsc) {
      try {
        p.g.gain.setTargetAtTime(0, t, 0.15);
      } catch {
        /* ignore */
      }
    }
  }

  /** explore = calmo; combat = tensão (urso/lobo). */
  setMood(mood) {
    this.mood = mood === "combat" ? "combat" : "explore";
  }

  setupCombatLayer(ctx) {
    // pad grave tenso
    this._combatPad = ctx.createOscillator();
    this._combatPad.type = "sawtooth";
    this._combatPad.gainNode = ctx.createGain();
    this._combatPad.gainNode.gain.value = 0.04;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 280;
    this._combatPad.connect(lp).connect(this._combatPad.gainNode).connect(this.combatBus);
    this._combatPad.frequency.value = 55;
    this._combatPad.start();

    this._combatPulseGain = ctx.createGain();
    this._combatPulseGain.gain.value = 0.08;
    this._combatPulseGain.connect(this.combatBus);
  }

  playCombatHit() {
    const ctx = this.getCtx();
    if (!ctx || !this.combatBus || this._moodBlend < 0.2) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 90 + Math.random() * 40;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1 * this._moodBlend, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(g).connect(this.combatBus);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  async discoverFiles() {
    // Só usa arquivos se existir music/manifest.json (evita soft-404 e atraso).
    // Sem manifesto → 100% procedural.
    const found = [];
    const base = new URL("music/", window.location.href).href;
    try {
      const man = await fetch(new URL("manifest.json", base).href, { cache: "no-store" });
      if (!man.ok) return found;
      const ct = (man.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) return found;
      const list = await man.json();
      if (!Array.isArray(list) || !list.length) return found;
      for (const name of list) {
        const url = new URL(String(name), base).href;
        if (await probeUrl(url)) {
          found.push({
            name: String(name).replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
            url,
          });
        }
      }
    } catch {
      /* sem manifesto válido */
    }
    return found;
  }

  playFile(entry) {
    if (!entry) return;
    if (this.fileAudio) {
      try {
        this.fileAudio.pause();
      } catch {
        /* ignore */
      }
    }
    const audio = new Audio(entry.url);
    audio.volume = 0.45;
    audio.preload = "auto";
    this.fileAudio = audio;
    this.onTrack?.(entry.name);
    audio.onended = () => this.nextAfterSilence(4 + Math.random() * 8);
    audio.play().catch(() => {
      // se falhar, pula para a próxima
      this.nextAfterSilence(1);
    });
  }

  nextAfterSilence(sec) {
    this.silence = sec;
    this._pendingNext = true;
  }

  setupProcGraph(ctx) {
    // pad quente e abafado (fundo Minecraft, não chiptune)
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 520;
    this.padFilter.Q.value = 0.4;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.4;
    this.padFilter.connect(this.padGain).connect(this.bus);

    this.padOsc = [0, 1, 2, 3].map((i) => {
      const o = ctx.createOscillator();
      // sine + triangle leve = pad “orgânico” C418
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = 110;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.08 : 0.04;
      o.connect(g).connect(this.padFilter);
      o.start();
      return { o, g };
    });

    // eco longo e suave (sala grande / neve)
    this.echo = ctx.createGain();
    const d = ctx.createDelay(3.2);
    d.delayTime.value = 1.05;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1200;
    this.echo.connect(d);
    d.connect(damp).connect(fb).connect(d);
    d.connect(this.bus);

    // filtro das notas "piano"
    this.noteFilter = ctx.createBiquadFilter();
    this.noteFilter.type = "lowpass";
    this.noteFilter.frequency.value = 2800;
    this.noteFilter.Q.value = 0.3;
    this.noteFilter.connect(this.bus);
  }

  beginProcTrack(track) {
    this.track = track;
    this.beat = track.beat;
    this.notesLeftInTrack = track.length;
    this.silence = 0;
    this.queue = [];
    this.retunePad(track.pad);
    this.fillPhrase();
    // Primeira nota quase imediata (antes parecia “sem música”)
    this.timer = 0.12;
    this.playNote(2, 4);
    this.notesLeftInTrack = Math.max(0, this.notesLeftInTrack - 1);
    this.onTrack?.(track.name);
  }

  retunePad(freqs) {
    const ctx = this.getCtx();
    if (!ctx || !this.padOsc) return;
    const t = ctx.currentTime;
    for (let i = 0; i < this.padOsc.length; i++) {
      const f = freqs[i % freqs.length] || 110;
      this.padOsc[i].o.frequency.cancelScheduledValues(t);
      const cur = Math.max(40, this.padOsc[i].o.frequency.value || f);
      this.padOsc[i].o.frequency.setValueAtTime(cur, t);
      this.padOsc[i].o.frequency.exponentialRampToValueAtTime(Math.max(40, f), t + 2.5);
      this.padOsc[i].o.type = "sine";
      const vol = i === 0 ? 0.11 : i === 1 ? 0.07 : 0.045;
      this.padOsc[i].g.gain.setTargetAtTime(vol, t, 1.2);
    }
  }

  fillPhrase() {
    const track = this.track;
    if (!track) return;
    // Motivo melódico (estilo exploração Minecraft) + variação leve
    const motif = MOTIFS[randInt(MOTIFS.length)];
    const transpose = randInt(3) - 1; // -1, 0, +1
    const max = track.scale.length - 1;
    for (let i = 0; i < motif.length && this.notesLeftInTrack > 0; i++) {
      this.notesLeftInTrack--;
      const raw = motif[i];
      if (raw < 0 || Math.random() > track.density) {
        this.queue.push([-1, 2 + randInt(3)]);
        continue;
      }
      const deg = Math.max(0, Math.min(max, raw + transpose));
      // notas longas — piano “Sweden”, não arpeggio corrido
      const beats = [3, 3, 4, 4, 5, 6][randInt(6)];
      this.queue.push([deg, beats]);
      // ocasionalmente dobra a nota (eco humano do tema)
      if (Math.random() < 0.12) {
        this.notesLeftInTrack = Math.max(0, this.notesLeftInTrack - 1);
        this.queue.push([deg, 2 + randInt(2)]);
      }
    }
    // respiração longa entre frases
    this.queue.push([-1, 4 + randInt(5)]);
  }

  playNote(degree, beats) {
    const ctx = this.getCtx();
    const track = this.track;
    if (!ctx || !this.bus || !track || degree < 0) return;
    const base = track.scale[degree % track.scale.length];
    // quase nunca sobe oitava — piano médio, clima C418
    const f = base * (Math.random() < track.bright ? 2 : 1);
    const dur = Math.max(1.1, beats * this.beat * 1.35);
    const t0 = ctx.currentTime;

    // "piano" Minecraft: suave, emocional, audível sob o vento
    const voices = [
      ["sine", 0.28, 0.1, 1],
      ["triangle", 0.12, 0.14, 1.003],
      ["sine", 0.06, 0.2, 0.997],
    ];
    for (const [type, vol, attack, ratio] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.setValueAtTime(vol * 0.85, t0 + attack + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const dest = this.noteFilter || this.bus;
      osc.connect(g).connect(dest);
      if (this.echo) {
        const send = ctx.createGain();
        send.gain.value = 0.62;
        g.connect(send).connect(this.echo);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.12);
    }
  }

  advancePlaylist() {
    if (!this.playlist.length) return;
    this.index += 1;
    if (this.index >= this.playlist.length) {
      // nova volta: reembaralha (ordem diferente a cada ciclo)
      this.playlist = shuffle(this.playlist);
      this.index = 0;
    }

    const next = this.playlist[this.index];
    if (!next) return;
    if (this.mode === "file") this.playFile(next);
    else this.beginProcTrack(next);
  }

  update(dt, dangerMul = 1) {
    if (!this.ready || !this.playlist.length) return;
    const ctx = this.getCtx();
    if (ctx?.state === "suspended") ctx.resume();

    // blend suave exploração ↔ combate
    const want = this.mood === "combat" ? 1 : 0;
    this._moodBlend += (want - this._moodBlend) * Math.min(1, dt * 1.8);

    if (this.bus) {
      const exploreVol = (0.65 - this._moodBlend * 0.12) * dangerMul;
      this.bus.gain.value += (exploreVol - this.bus.gain.value) * Math.min(1, dt * 2);
    }
    if (this.combatBus) {
      const cVol = 0.32 * this._moodBlend * dangerMul;
      this.combatBus.gain.value += (cVol - this.combatBus.gain.value) * Math.min(1, dt * 2.5);
    }
    if (this._combatPad) {
      const f = 48 + this._moodBlend * 22 + Math.sin(ctx.currentTime * 0.7) * 3;
      this._combatPad.frequency.setTargetAtTime(f, ctx.currentTime, 0.3);
    }
    if (this.fileAudio && !this.fileAudio.paused) {
      this.fileAudio.volume = (0.48 - this._moodBlend * 0.1) * dangerMul;
    }

    // pulso de tensão no combate
    if (this._moodBlend > 0.35) {
      this._combatPulse -= dt;
      if (this._combatPulse <= 0) {
        this._combatPulse = 0.45 + (1 - this._moodBlend) * 0.3;
        this.playCombatHit();
      }
    }

    // silêncio entre faixas — curto para a trilha não “sumir”
    if (this.silence > 0 || this._pendingNext) {
      if (this._pendingNext && this.silence <= 0) {
        this.silence = this.mood === "combat" ? 0.3 + Math.random() * 0.5 : 1.2 + Math.random() * 1.8;
      }
      this._pendingNext = false;
      this.silence -= dt * (this.mood === "combat" ? 2.2 : 1);
      if (this.silence > 0) return;
      this.silence = 0;
      this.advancePlaylist();
      return;
    }

    if (this.mode === "file") return;

    this.timer -= dt;
    if (this.timer > 0) return;

    if (!this.queue.length) {
      if (this.notesLeftInTrack <= 0) {
        this.silence = this.mood === "combat" ? 0.4 + Math.random() * 0.8 : 1.5 + Math.random() * 2.2;
        return;
      }
      this.fillPhrase();
      if (!this.queue.length) {
        this.silence = this.mood === "combat" ? 0.35 : 1.2 + Math.random() * 1.5;
        return;
      }
    }

    const [deg, beats] = this.queue.shift();
    this.playNote(deg, beats);
    // combate: ritmo mais apertado
    const beatScale = this.mood === "combat" ? 0.72 : 1;
    this.timer = Math.max(0.2, beats * this.beat * beatScale);
  }
}
