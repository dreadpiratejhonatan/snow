// Trilha ambient de neve — pads suaves + notas raras (sem chiptune / sem melodia insistente).
//
// 1) Se existir music/manifest.json com mp3/ogg válidos, eles têm prioridade.
// 2) Senão, procedural quieto (fundo, não “OST barulhenta”).
//
// Não embutimos OST comercial — é protegida por copyright.

const FILE_CANDIDATES = [
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

// Motivos curtos com muitas pausas (raw < 0 = silêncio).
const MOTIFS = [
  [0, -1, -1, 2, -1, -1],
  [-1, 4, -1, -1, 2, -1],
  [0, -1, 4, -1, -1, -1],
  [-1, -1, 2, -1, 0, -1],
  [5, -1, -1, -1, 2, -1],
  [-1, 0, -1, -1, -1, 4],
];

/** Faixas ambient: pad dominante, poucas notas, beats longos. */
const PROC_TRACKS = [
  {
    id: "white-field",
    name: "Campo Branco",
    scale: [196.0, 220.0, 261.63, 293.66, 329.63],
    pad: [65.41, 98.0, 130.81, 164.81],
    beat: 2.1,
    density: 0.38,
    bright: 0.02,
    length: 22,
  },
  {
    id: "frost-breath",
    name: "Bafo de Gelo",
    scale: [174.61, 196.0, 233.08, 261.63, 311.13],
    pad: [58.27, 87.31, 116.54, 146.83],
    beat: 2.35,
    density: 0.34,
    bright: 0.02,
    length: 20,
  },
  {
    id: "cabin-dusk",
    name: "Cabana ao Entardecer",
    scale: [146.83, 174.61, 196.0, 220.0, 261.63],
    pad: [73.42, 98.0, 123.47, 174.61],
    beat: 2.0,
    density: 0.4,
    bright: 0.03,
    length: 24,
  },
  {
    id: "aurora-drift",
    name: "Deriva da Aurora",
    scale: [220.0, 246.94, 277.18, 329.63, 369.99],
    pad: [82.41, 110.0, 138.59, 185.0],
    beat: 2.2,
    density: 0.36,
    bright: 0.04,
    length: 22,
  },
  {
    id: "deep-snow",
    name: "Neve Funda",
    scale: [130.81, 155.56, 174.61, 196.0, 233.08],
    pad: [55.0, 82.41, 110.0, 146.83],
    beat: 2.5,
    density: 0.32,
    bright: 0.01,
    length: 18,
  },
  {
    id: "quiet-trail",
    name: "Trilha Quiet",
    scale: [185.0, 207.65, 246.94, 277.18, 311.13],
    pad: [61.74, 92.5, 123.47, 155.56],
    beat: 2.15,
    density: 0.37,
    bright: 0.03,
    length: 20,
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
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-64" },
      cache: "no-store",
    });
    if (!(res.ok || res.status === 206)) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("text/plain") || ct.includes("application/json")) {
      return false;
    }
    if (!(ct.includes("audio/") || ct.includes("application/ogg") || ct.includes("application/octet-stream"))) {
      return false;
    }
    const cl = Number(res.headers.get("content-length") || 0);
    if (cl > 0 && cl < 500) return false;
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
    this.beat = 2;
    this.notesLeftInTrack = 0;
    this._combatPulse = 0;
  }

  async start() {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master || this.ready) return;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ainda bloqueado */
      }
    }
    if (ctx.state === "suspended") return;
    this.bus = ctx.createGain();
    // Fundo discreto — não compete com vento/SFX
    this.bus.gain.value = 0.28;
    this.bus.connect(master);

    this.combatBus = ctx.createGain();
    this.combatBus.gain.value = 0;
    this.combatBus.connect(master);
    this.setupCombatLayer(ctx);

    this.mode = "proc";
    this.setupProcGraph(ctx);
    const proc = freshPlaylist(PROC_TRACKS, "id");
    this.playlist = proc.list;
    this.index = proc.start;
    this.beginProcTrack(this.playlist[this.index]);
    this.ready = true;
    this.onTrack?.(this.playlist[this.index]?.name || "Trilha");

    const files = await this.discoverFiles();
    if (files.length > 0) {
      const filePl = freshPlaylist(
        files.map((f) => ({ ...f, id: f.url })),
        "id"
      );
      const ok = await this.trySwitchToFiles(filePl);
      if (!ok) {
        console.warn("Music: arquivos inválidos — mantendo trilha procedural");
      }
    }
  }

  trySwitchToFiles(filePl) {
    return new Promise((resolve) => {
      const entry = filePl.list[filePl.start];
      if (!entry) {
        resolve(false);
        return;
      }
      const audio = new Audio(entry.url);
      audio.volume = 0.32;
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
        audio.onended = () => this.nextAfterSilence(6 + Math.random() * 8);
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

  setMood(mood) {
    this.mood = mood === "combat" ? "combat" : "explore";
  }

  setupCombatLayer(ctx) {
    // tensão bem baixa (sine grave, sem serra)
    this._combatPad = ctx.createOscillator();
    this._combatPad.type = "sine";
    this._combatPad.gainNode = ctx.createGain();
    this._combatPad.gainNode.gain.value = 0.018;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    this._combatPad.connect(lp).connect(this._combatPad.gainNode).connect(this.combatBus);
    this._combatPad.frequency.value = 48;
    this._combatPad.start();

    this._combatPulseGain = ctx.createGain();
    this._combatPulseGain.gain.value = 0.03;
    this._combatPulseGain.connect(this.combatBus);
  }

  playCombatHit() {
    const ctx = this.getCtx();
    if (!ctx || !this.combatBus || this._moodBlend < 0.35) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 70 + Math.random() * 20;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 * this._moodBlend, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g).connect(this.combatBus);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  }

  async discoverFiles() {
    void FILE_CANDIDATES; // lista de referência no README / futuro
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
    audio.volume = 0.3;
    audio.preload = "auto";
    this.fileAudio = audio;
    this.onTrack?.(entry.name);
    audio.onended = () => this.nextAfterSilence(8 + Math.random() * 10);
    audio.play().catch(() => {
      this.nextAfterSilence(1);
    });
  }

  nextAfterSilence(sec) {
    this.silence = sec;
    this._pendingNext = true;
  }

  setupProcGraph(ctx) {
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 380;
    this.padFilter.Q.value = 0.35;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.22;
    this.padFilter.connect(this.padGain).connect(this.bus);

    this.padOsc = [0, 1, 2].map((i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 110;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.07 : 0.04;
      o.connect(g).connect(this.padFilter);
      o.start();
      return { o, g };
    });

    // eco bem curto e abafado (sem “caverna de piano”)
    this.echo = ctx.createGain();
    const d = ctx.createDelay(2.5);
    d.delayTime.value = 0.85;
    const fb = ctx.createGain();
    fb.gain.value = 0.18;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 900;
    this.echo.connect(d);
    d.connect(damp).connect(fb).connect(d);
    d.connect(this.bus);

    this.noteFilter = ctx.createBiquadFilter();
    this.noteFilter.type = "lowpass";
    this.noteFilter.frequency.value = 1600;
    this.noteFilter.Q.value = 0.25;
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
    // Entrada suave: só pad por ~2s, sem “rajada” de notas no boot
    this.timer = 1.8 + Math.random() * 1.2;
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
      this.padOsc[i].o.frequency.exponentialRampToValueAtTime(Math.max(40, f), t + 2.4);
      this.padOsc[i].o.type = "sine";
      const vol = i === 0 ? 0.075 : i === 1 ? 0.045 : 0.03;
      this.padOsc[i].g.gain.setTargetAtTime(vol, t, 1.0);
    }
  }

  fillPhrase() {
    const track = this.track;
    if (!track) return;
    const motif = MOTIFS[randInt(MOTIFS.length)];
    const transpose = randInt(2); // 0 ou +1 — pouca variação
    const max = track.scale.length - 1;
    for (let i = 0; i < motif.length && this.notesLeftInTrack > 0; i++) {
      this.notesLeftInTrack--;
      const raw = motif[i];
      if (raw < 0 || Math.random() > track.density) {
        this.queue.push([-1, 3 + randInt(5)]);
        continue;
      }
      const deg = Math.max(0, Math.min(max, raw + transpose));
      const beats = [4, 5, 6, 7, 8][randInt(5)];
      this.queue.push([deg, beats]);
    }
    // respiração longa entre frases
    this.queue.push([-1, 5 + randInt(6)]);
  }

  playNote(degree, beats) {
    const ctx = this.getCtx();
    const track = this.track;
    if (!ctx || !this.bus || !track || degree < 0) return;
    const base = track.scale[degree % track.scale.length];
    const f = base * (Math.random() < track.bright ? 2 : 1);
    const dur = Math.max(1.4, beats * this.beat * 1.15);
    const t0 = ctx.currentTime;

    // sino suave / flauta distante — volume baixo
    const voices = [
      ["sine", 0.11, 0.22, 1],
      ["triangle", 0.045, 0.28, 1.002],
    ];
    for (const [type, vol, attack, ratio] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.setValueAtTime(vol * 0.75, t0 + attack + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const dest = this.noteFilter || this.bus;
      osc.connect(g).connect(dest);
      if (this.echo) {
        const send = ctx.createGain();
        send.gain.value = 0.22;
        g.connect(send).connect(this.echo);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.15);
    }
  }

  advancePlaylist() {
    if (!this.playlist.length) return;
    this.index += 1;
    if (this.index >= this.playlist.length) {
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

    const want = this.mood === "combat" ? 1 : 0;
    this._moodBlend += (want - this._moodBlend) * Math.min(1, dt * 1.4);

    if (this.bus) {
      const exploreVol = (0.28 - this._moodBlend * 0.06) * dangerMul;
      this.bus.gain.value += (exploreVol - this.bus.gain.value) * Math.min(1, dt * 1.6);
    }
    if (this.combatBus) {
      const cVol = 0.12 * this._moodBlend * dangerMul;
      this.combatBus.gain.value += (cVol - this.combatBus.gain.value) * Math.min(1, dt * 2);
    }
    if (this._combatPad) {
      const f = 44 + this._moodBlend * 14 + Math.sin(ctx.currentTime * 0.45) * 2;
      this._combatPad.frequency.setTargetAtTime(f, ctx.currentTime, 0.4);
    }
    if (this.fileAudio && !this.fileAudio.paused) {
      this.fileAudio.volume = (0.3 - this._moodBlend * 0.06) * dangerMul;
    }

    // combate: pulsos bem raros
    if (this._moodBlend > 0.45) {
      this._combatPulse -= dt;
      if (this._combatPulse <= 0) {
        this._combatPulse = 1.1 + (1 - this._moodBlend) * 0.6;
        this.playCombatHit();
      }
    }

    if (this.silence > 0 || this._pendingNext) {
      if (this._pendingNext && this.silence <= 0) {
        this.silence = this.mood === "combat" ? 1.2 + Math.random() * 1.5 : 3.5 + Math.random() * 4.5;
      }
      this._pendingNext = false;
      this.silence -= dt * (this.mood === "combat" ? 1.4 : 1);
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
        this.silence = this.mood === "combat" ? 1.0 + Math.random() * 1.2 : 2.5 + Math.random() * 3.5;
        return;
      }
      this.fillPhrase();
      if (!this.queue.length) {
        this.silence = this.mood === "combat" ? 0.8 : 2.0 + Math.random() * 2.5;
        return;
      }
    }

    const [deg, beats] = this.queue.shift();
    this.playNote(deg, beats);
    const beatScale = this.mood === "combat" ? 0.85 : 1;
    this.timer = Math.max(0.45, beats * this.beat * beatScale);
  }
}
