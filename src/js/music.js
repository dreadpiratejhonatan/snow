// Playlist procedural: cada entrada embaralha faixas ORIGINAIS.
//
// Clima: aventura 16-bit / natureza (inspiração de jogos Mega Drive de exploração
// — NÃO é a OST oficial de Pocahontas nem de Minecraft; essas são protegidas).
//
// 1) Se existir music/manifest.json + arquivos válidos → prioridade.
// 2) Senão → faixas procedurais bem distintas (ritmo, escala e timbre).

const FILE_CANDIDATES = [
  "adventure.mp3",
  "river.mp3",
  "forest.mp3",
  "village.mp3",
  "snow.mp3",
  "theme.mp3",
];

/** Bancos de motivos (graus). Cada faixa usa um banco — soa diferente. */
const MOTIF_BANKS = {
  // tema heróico / abertura
  hero: [
    [0, 2, 4, 5, 7, 5, 4, 2],
    [0, 4, 5, 7, 5, 4, 2, 0],
    [2, 4, 5, 4, 7, 5, -1, 4],
    [0, 0, 2, 4, 5, 4, 2, -1],
  ],
  // flauta / rio — arcos longos
  river: [
    [0, 2, 3, 5, 3, 2, 0, -1],
    [5, 3, 2, 0, 2, 3, 5, 7],
    [2, 3, 5, 7, 5, 3, 2, 0],
    [0, 3, -1, 5, 3, 2, 0, 2],
  ],
  // aldeia — saltos alegres
  village: [
    [0, 4, 2, 5, 4, 2, 0, 4],
    [2, 0, 4, 5, 7, 5, 4, 2],
    [0, 2, 4, -1, 5, 4, 2, 0],
    [4, 5, 7, 5, 4, 2, 4, 0],
  ],
  // neve / mistério — dórico
  frost: [
    [0, 1, 3, 5, 3, 1, 0, -1],
    [5, 3, 1, 0, 1, 3, 5, 3],
    [0, 3, 5, 7, 5, 3, -1, 1],
    [1, 3, 5, 3, 1, 0, 1, 3],
  ],
  // marcha / exploraçãoição
  trek: [
    [0, 0, 2, 2, 4, 4, 5, 4],
    [0, 2, 4, 5, 4, 2, 0, 0],
    [2, 4, 5, 7, 5, 4, 2, 4],
    [0, 4, -1, 5, 4, 2, 0, 2],
  ],
  // festa / coragem
  feast: [
    [0, 2, 4, 7, 5, 4, 2, 0],
    [4, 5, 7, 9, 7, 5, 4, 2],
    [0, 4, 7, 4, 5, 2, 0, 4],
    [2, 5, 4, 7, 5, 4, -1, 0],
  ],
};

// Faixas: escalas/ritmos bem diferentes para a playlist “mudar de música”.
const PROC_TRACKS = [
  {
    id: "dawn-river",
    name: "Rio da Aurora",
    scale: [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 523.25], // C major
    pad: [130.81, 164.81, 196.0, 261.63],
    beat: 0.42,
    density: 0.94,
    bright: 0.35,
    length: 48,
    bank: "river",
    voice: "flute",
    rhythm: "legato",
  },
  {
    id: "wind-trail",
    name: "Trilha do Vento",
    scale: [293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 587.33], // D mixolydian-ish
    pad: [146.83, 174.61, 220.0, 293.66],
    beat: 0.38,
    density: 0.92,
    bright: 0.4,
    length: 44,
    bank: "hero",
    voice: "flute",
    rhythm: "pulse",
  },
  {
    id: "winter-village",
    name: "Aldeia de Inverno",
    scale: [246.94, 277.18, 311.13, 349.23, 369.99, 415.3, 493.88], // Bb-ish bright
    pad: [123.47, 155.56, 185.0, 246.94],
    beat: 0.36,
    density: 0.95,
    bright: 0.45,
    length: 40,
    bank: "village",
    voice: "harp",
    rhythm: "arp",
  },
  {
    id: "frozen-path",
    name: "Caminho Congelado",
    scale: [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0], // A minor-ish
    pad: [110.0, 146.83, 174.61, 220.0],
    beat: 0.48,
    density: 0.88,
    bright: 0.22,
    length: 42,
    bank: "frost",
    voice: "bell",
    rhythm: "legato",
  },
  {
    id: "north-march",
    name: "Marcha do Norte",
    scale: [196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 392.0],
    pad: [98.0, 130.81, 164.81, 196.0],
    beat: 0.34,
    density: 0.93,
    bright: 0.28,
    length: 46,
    bank: "trek",
    voice: "brass",
    rhythm: "pulse",
  },
  {
    id: "spirit-grove",
    name: "Bosque dos Espíritos",
    scale: [174.61, 196.0, 220.0, 261.63, 293.66, 329.63, 349.23],
    pad: [87.31, 110.0, 146.83, 174.61],
    beat: 0.45,
    density: 0.9,
    bright: 0.3,
    length: 44,
    bank: "river",
    voice: "flute",
    rhythm: "arp",
  },
  {
    id: "brave-hearth",
    name: "Lar Corajoso",
    scale: [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 587.33], // C → brighter
    pad: [130.81, 155.56, 196.0, 261.63],
    beat: 0.32,
    density: 0.96,
    bright: 0.5,
    length: 40,
    bank: "feast",
    voice: "harp",
    rhythm: "pulse",
  },
  {
    id: "snow-dance",
    name: "Dança na Neve",
    scale: [329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33],
    pad: [164.81, 196.0, 246.94, 329.63],
    beat: 0.3,
    density: 0.97,
    bright: 0.55,
    length: 38,
    bank: "village",
    voice: "bell",
    rhythm: "arp",
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

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ainda bloqueado */
      }
    }
    if (ctx.state === "suspended") return;
    this.bus = ctx.createGain();
    // Presente o bastante para ouvir no celular / notebook com volume médio
    this.bus.gain.value = 0.82;
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
    this.padGain.gain.value = 0.55;
    this.padFilter.connect(this.padGain).connect(this.bus);

    this.padOsc = [0, 1, 2, 3].map((i) => {
      const o = ctx.createOscillator();
      // sine + triangle leve = pad “orgânico” C418
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = 110;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.12 : 0.065;
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
    // abre o filtro da lead conforme o timbre da faixa
    if (this.noteFilter) {
      const open = track.voice === "brass" ? 4200 : track.voice === "bell" ? 5200 : 3200;
      this.noteFilter.frequency.setTargetAtTime(open, this.getCtx().currentTime, 0.2);
    }
    this.retunePad(track.pad, track.voice);
    this.fillPhrase();
    this.timer = 0.06;
    // gancho imediato — motivo curto da própria faixa
    this.playNote(0, 2);
    this.notesLeftInTrack = Math.max(0, this.notesLeftInTrack - 1);
    this.queue.unshift([2, 2], [4, 2], [5, 3]);
    this.onTrack?.(track.name);
  }

  retunePad(freqs, voice = "flute") {
    const ctx = this.getCtx();
    if (!ctx || !this.padOsc) return;
    const t = ctx.currentTime;
    const padMul = voice === "brass" ? 0.7 : voice === "bell" ? 0.55 : 0.85;
    for (let i = 0; i < this.padOsc.length; i++) {
      const f = freqs[i % freqs.length] || 110;
      this.padOsc[i].o.frequency.cancelScheduledValues(t);
      const cur = Math.max(40, this.padOsc[i].o.frequency.value || f);
      this.padOsc[i].o.frequency.setValueAtTime(cur, t);
      this.padOsc[i].o.frequency.exponentialRampToValueAtTime(Math.max(40, f), t + 1.2);
      this.padOsc[i].o.type = i % 2 === 0 ? "sine" : "triangle";
      const vol = (i === 0 ? 0.12 : i === 1 ? 0.08 : 0.05) * padMul;
      this.padOsc[i].g.gain.setTargetAtTime(vol, t, 0.5);
    }
  }

  fillPhrase() {
    const track = this.track;
    if (!track) return;
    const bank = MOTIF_BANKS[track.bank] || MOTIF_BANKS.hero;
    const motif = bank[randInt(bank.length)];
    const transpose = randInt(3) - 1;
    const max = track.scale.length - 1;
    const rhythm = track.rhythm || "legato";

    for (let i = 0; i < motif.length && this.notesLeftInTrack > 0; i++) {
      this.notesLeftInTrack--;
      const raw = motif[i];
      if (raw < 0 || Math.random() > track.density) {
        this.queue.push([-1, rhythm === "pulse" ? 1 : 1 + randInt(2)]);
        continue;
      }
      const deg = Math.max(0, Math.min(max, raw + transpose));
      let beats;
      if (rhythm === "arp") {
        beats = [1, 1, 1, 2, 2][randInt(5)];
      } else if (rhythm === "pulse") {
        beats = [1, 2, 2, 2, 3][randInt(5)];
      } else {
        beats = [2, 2, 3, 3, 4][randInt(5)];
      }
      this.queue.push([deg, beats]);
      // eco curto estilo 16-bit
      if (rhythm !== "arp" && Math.random() < 0.18) {
        this.notesLeftInTrack = Math.max(0, this.notesLeftInTrack - 1);
        this.queue.push([deg, 1]);
      }
    }
    this.queue.push([-1, rhythm === "arp" ? 1 + randInt(2) : 1 + randInt(2)]);
  }

  playNote(degree, beats) {
    const ctx = this.getCtx();
    const track = this.track;
    if (!ctx || !this.bus || !track || degree < 0) return;
    const base = track.scale[degree % track.scale.length];
    const oct = Math.random() < (track.bright || 0.3) ? 2 : 1;
    const f = base * oct;
    const dur = Math.max(0.22, beats * this.beat * (track.rhythm === "arp" ? 0.95 : 1.15));
    const t0 = ctx.currentTime;
    const voice = track.voice || "flute";

    // timbres distintos por faixa (aventura 16-bit, não piano Minecraft)
    let voices;
    if (voice === "flute") {
      voices = [
        ["triangle", 0.34, 0.04, 1],
        ["sine", 0.18, 0.06, 2],
        ["sine", 0.08, 0.1, 1.003],
      ];
    } else if (voice === "harp") {
      voices = [
        ["triangle", 0.28, 0.01, 1],
        ["sine", 0.2, 0.02, 2],
        ["triangle", 0.1, 0.03, 3],
      ];
    } else if (voice === "brass") {
      voices = [
        ["sawtooth", 0.14, 0.05, 1],
        ["square", 0.1, 0.06, 1.01],
        ["sine", 0.12, 0.08, 0.5],
      ];
    } else {
      // bell
      voices = [
        ["sine", 0.3, 0.01, 1],
        ["sine", 0.16, 0.02, 2.01],
        ["triangle", 0.1, 0.03, 3.0],
      ];
    }

    for (const [type, vol, attack, ratio] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.setValueAtTime(vol * 0.75, t0 + attack + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const dest = this.noteFilter || this.bus;
      osc.connect(g).connect(dest);
      if (this.echo) {
        const send = ctx.createGain();
        send.gain.value = voice === "bell" ? 0.75 : 0.45;
        g.connect(send).connect(this.echo);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.08);
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
      const exploreVol = (0.82 - this._moodBlend * 0.12) * dangerMul;
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

    // silêncio entre faixas — curto para a trilha trocar de verdade
    if (this.silence > 0 || this._pendingNext) {
      if (this._pendingNext && this.silence <= 0) {
        this.silence = this.mood === "combat" ? 0.2 + Math.random() * 0.3 : 0.35 + Math.random() * 0.45;
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
        this.silence = this.mood === "combat" ? 0.25 + Math.random() * 0.35 : 0.4 + Math.random() * 0.5;
        return;
      }
      this.fillPhrase();
      if (!this.queue.length) {
        this.silence = this.mood === "combat" ? 0.25 : 0.35 + Math.random() * 0.4;
        return;
      }
    }

    const [deg, beats] = this.queue.shift();
    this.playNote(deg, beats);
    const beatScale = this.mood === "combat" ? 0.68 : 1;
    this.timer = Math.max(0.12, beats * this.beat * beatScale);
  }
}
