// Paisagem sonora de inverno, 100% sintetizada com WebAudio (sem arquivos).
// Vento em camadas com rajadas, neve crocante sob os pés, fauna distante,
// urso ameaçador e batimento cardíaco quando o perigo aperta.
// Trilha: playlist embaralhada (estilo Minecraft) — ver music.js.

import { MusicPlayer } from "./music.js";

let ctx = null;
let master = null;
let noiseBuf = null;
let echoIn = null;

function ensureContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // eco simples (delay com feedback filtrado) — dá sensação de espaço aberto
    echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.31;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1600;
    echoIn.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
}

export class Ambience {
  constructor() {
    this.started = false;
    this.stepTimer = 0;
    this.owlTimer = 8;
    this.birdTimer = 3;
    this.crackleTimer = 0;
    this.popTimer = 2;
    this.heartTimer = 0;
    this.wolfTimer = 18;
    this.bearRoarTimer = 0;
    this.gust = 0;
    this.gustTarget = 0;
    this.gustTimer = 0;
    this.musicOn = true;
    this.music = null;
    this.onTrackChange = null; // (nome) => void — preenchido pelo Game
  }

  // precisa ser chamado a partir de um gesto do usuário (clique/toque)
  start() {
    try {
      ensureContext();
    } catch {
      return; // áudio é opcional
    }
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    if (this.started) return;
    this.started = true;

    // camada grave do vento: ruído passa-baixa contínuo
    const low = ctx.createBufferSource();
    low.buffer = noiseBuf;
    low.loop = true;
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = 240;
    this.windLow = ctx.createGain();
    this.windLow.gain.value = 0.022; // um pouco mais baixo — trilha Minecraft sobressai
    low.connect(lowFilter).connect(this.windLow).connect(master);
    low.start();

    // camada aguda: assobio do vento (banda estreita varrida por um LFO)
    const high = ctx.createBufferSource();
    high.buffer = noiseBuf;
    high.loop = true;
    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = "bandpass";
    this.whistleFilter.frequency.value = 760;
    this.whistleFilter.Q.value = 7;
    this.windHigh = ctx.createGain();
    this.windHigh.gain.value = 0.005;
    high.connect(this.whistleFilter).connect(this.windHigh).connect(master);
    high.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(this.whistleFilter.frequency);
    lfo.start();

    this.startMusic();
  }

  startMusic() {
    if (!this.musicOn || this.music) return;
    this.music = new MusicPlayer(
      () => ctx,
      () => master
    );
    this.music.onTrack = (name) => this.onTrackChange?.(name);
    // async: sonda /music/ e inicia playlist embaralhada
    this.music.start();
  }

  updateMusic(dt, s) {
    if (!this.music) return;
    const inCombat = !!(s.bearChasing && s.bearDist < 22);
    this.music.setMood?.(inCombat ? "combat" : "explore");
    // combate: volume um pouco mais presente; exploração: calmo
    const danger = inCombat ? 0.85 : s.lowHealth ? 0.7 : 1;
    this.music.update(dt, danger);
  }

  // bipe curto com envelope; echoAmt manda uma parte para o eco
  blip(freq, dur, vol, type = "sine", slideTo = 0, echoAmt = 0) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(master);
    if (echoAmt > 0 && echoIn) {
      const send = ctx.createGain();
      send.gain.value = echoAmt;
      g.connect(send).connect(echoIn);
    }
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  // sopro de ruído filtrado (passos, impactos)
  noiseBurst(dur, vol, freq, q = 0.9, type = "bandpass", echoAmt = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(master);
    if (echoAmt > 0 && echoIn) {
      const send = ctx.createGain();
      send.gain.value = echoAmt;
      g.connect(send).connect(echoIn);
    }
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  // ----- passos -----
  stepSnow(sprint) {
    // neve crocante: 3 micro-esmagamentos rápidos + baque surdo
    const v = sprint ? 0.075 : 0.055;
    this.noiseBurst(0.05, v, 1500 + Math.random() * 900, 0.6);
    setTimeout(() => ctx && this.noiseBurst(0.035, v * 0.7, 2100 + Math.random() * 900, 0.6), 25);
    setTimeout(() => ctx && this.noiseBurst(0.03, v * 0.45, 2600 + Math.random() * 1000, 0.6), 52);
    this.noiseBurst(0.07, 0.05, 160 + Math.random() * 50, 0.8);
  }

  stepIce(sprint) {
    // toque duro e curto, com "tinido" ocasional do gelo
    this.noiseBurst(0.03, sprint ? 0.07 : 0.05, 2400 + Math.random() * 600, 2.2);
    this.noiseBurst(0.05, 0.04, 220, 0.9);
    if (Math.random() < 0.12) {
      // estalo do gelo sob o peso
      this.blip(900 + Math.random() * 500, 0.35, 0.03, "sine", 180, 0.5);
    }
  }

  // ----- efeitos do survival -----
  pickup() {
    if (!this.started || !ctx) return;
    this.blip(880, 0.09, 0.07, "triangle", 1320, 0.3);
    setTimeout(() => ctx && this.blip(1320, 0.12, 0.06, "triangle", 1760, 0.3), 90);
  }

  discover() {
    if (!this.started || !ctx) return;
    // sininho misterioso de "tem algo por perto"
    this.blip(1560, 0.4, 0.035, "sine", 1520, 0.6);
    setTimeout(() => ctx && this.blip(2080, 0.5, 0.03, "sine", 2040, 0.6), 180);
  }

  deposit() {
    if (!this.started || !ctx) return;
    this.blip(520, 0.1, 0.07, "triangle", 660, 0.25);
    setTimeout(() => ctx && this.blip(660, 0.14, 0.06, "triangle", 880, 0.25), 110);
    setTimeout(() => ctx && this.blip(880, 0.18, 0.06, "triangle", 1040, 0.3), 230);
  }

  hurt() {
    if (!this.started || !ctx) return;
    this.blip(180, 0.22, 0.14, "sawtooth", 70);
    this.noiseBurst(0.15, 0.12, 250);
  }

  // ----- armas de fogo / arco / explosão -----
  gunshot(power = 1) {
    if (!this.started || !ctx) return;
    // estampido: transiente agudo + corpo grave + eco de vale
    this.noiseBurst(0.05, 0.28 * power, 3200, 0.4, "highpass", 0.35);
    this.noiseBurst(0.16, 0.26 * power, 380, 0.5, "lowpass", 0.4);
    this.blip(150, 0.09, 0.12 * power, "square", 55, 0.3);
  }

  /** Revólver: estalo seco e curto. */
  revolverShot() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.04, 0.28, 2800, 0.8, "bandpass", 0.25);
    this.blip(220, 0.07, 0.12, "square", 80, 0.2);
    this.noiseBurst(0.08, 0.14, 420, 0.6, "lowpass", 0.2);
  }

  /** Escopeta: boom grave espalhado. */
  shotgunShot() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.08, 0.35, 1800, 0.3, "highpass", 0.4);
    this.noiseBurst(0.28, 0.32, 220, 0.4, "lowpass", 0.5);
    this.blip(90, 0.14, 0.16, "sawtooth", 40, 0.35);
  }

  /** AK: estalo metálico rápido (por tiro da rajada). */
  akShot() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.035, 0.22, 3600, 1.2, "bandpass", 0.15);
    this.blip(180, 0.05, 0.1, "square", 70);
    this.noiseBurst(0.06, 0.12, 500, 0.7, "lowpass");
  }

  bowShot() {
    if (!this.started || !ctx) return;
    // corda + assobio da flecha
    this.blip(280, 0.08, 0.1, "triangle", 120);
    this.blip(480, 0.05, 0.06, "sine", 200);
    this.noiseBurst(0.22, 0.08, 2200, 1.2, "bandpass", 0.25);
  }

  /** Besta: trava mecânica + click + whoosh seco. */
  crossbowShot() {
    if (!this.started || !ctx) return;
    // click da trava
    this.blip(900, 0.035, 0.11, "square", 400);
    this.noiseBurst(0.04, 0.12, 1600, 2.5, "bandpass");
    // liberação + haste
    setTimeout(() => {
      if (!ctx) return;
      this.blip(180, 0.06, 0.08, "triangle", 90);
      this.noiseBurst(0.14, 0.1, 2800, 1.5, "bandpass", 0.2);
    }, 40);
  }

  /** Granada: pino + arremesso. */
  grenadeThrow() {
    if (!this.started || !ctx) return;
    this.blip(1200, 0.04, 0.08, "square", 600);
    this.noiseBurst(0.05, 0.08, 2000, 1.5, "bandpass");
    setTimeout(() => {
      if (!ctx) return;
      this.noiseBurst(0.12, 0.07, 800, 0.8, "lowpass");
      this.blip(200, 0.1, 0.05, "triangle", 100);
    }, 50);
  }

  meleeSwing() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.1, 0.1, 900, 0.7, "bandpass", 0.15);
    this.blip(140, 0.08, 0.05, "triangle", 60);
  }

  /** Escolhe SFX pelo tipo de arma. */
  weaponFire(weapon) {
    if (!this.started || !ctx || !weapon) return;
    switch (weapon.id) {
      case "revolver":
        this.revolverShot();
        break;
      case "shotgun":
        this.shotgunShot();
        break;
      case "ak47":
        this.akShot();
        break;
      case "bow":
        this.bowShot();
        break;
      case "crossbow":
        this.crossbowShot();
        break;
      case "grenade":
        this.grenadeThrow();
        break;
      default:
        if (weapon.fire === "hitscan") this.gunshot(1);
        else if (weapon.fire === "projectile") this.bowShot();
        else if (weapon.fire === "thrown") this.grenadeThrow();
        else this.meleeSwing();
    }
  }

  explosion() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.5, 0.35, 300, 0.3, "lowpass", 0.55);
    this.noiseBurst(0.12, 0.18, 2200, 0.5, "highpass", 0.3);
    this.blip(64, 0.5, 0.22, "sine", 28, 0.4);
  }

  growl() {
    if (!this.started || !ctx) return;
    // duas serras graves desafinadas descendo + vibrato + respiração de ruído
    const dur = 1.3;
    for (const [f0, f1, vol] of [[82, 42, 0.13], [124, 66, 0.08]]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f0, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 11;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 9;
      vib.connect(vibGain).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 340;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(lp).connect(g).connect(master);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      g.connect(send).connect(echoIn);
      osc.start();
      vib.start();
      osc.stop(ctx.currentTime + dur + 0.1);
      vib.stop(ctx.currentTime + dur + 0.1);
    }
    this.noiseBurst(0.9, 0.06, 160, 0.7, "bandpass", 0.4);
  }

  // rosnado curto enquanto persegue (volume cai com a distância)
  roarSmall(intensity) {
    if (!this.started || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(70 + Math.random() * 25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.09 * intensity, ctx.currentTime + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc.connect(lp).connect(g).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }

  bearHit() {
    if (!this.started || !ctx) return;
    this.noiseBurst(0.12, 0.16, 320);
    this.blip(140, 0.12, 0.08, "square", 90);
  }

  victory() {
    if (!this.started || !ctx) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => ctx && this.blip(f, 0.3, 0.08, "triangle", 0, 0.4), i * 160));
  }

  auroraChime() {
    if (!this.started || !ctx) return;
    // arpejo cristalino suave (aurora)
    const notes = [523, 659, 784, 988, 1175];
    notes.forEach((f, i) => {
      setTimeout(() => ctx && this.blip(f, 0.55, 0.04, "sine", f * 1.01, 0.7), i * 140);
    });
  }

  auroraGift() {
    if (!this.started || !ctx) return;
    this.blip(880, 0.2, 0.08, "triangle", 1320, 0.5);
    setTimeout(() => ctx && this.blip(1320, 0.35, 0.07, "sine", 1760, 0.6), 120);
    setTimeout(() => ctx && this.blip(1760, 0.5, 0.05, "sine", 2200, 0.7), 260);
  }

  wolfHowl() {
    if (!this.started || !ctx) return;
    // uivo distante: sobe, segura com vibrato e desce
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(310, t);
    osc.frequency.linearRampToValueAtTime(520, t + 0.5);
    osc.frequency.setValueAtTime(520, t + 1.1);
    osc.frequency.linearRampToValueAtTime(330, t + 1.9);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 7;
    vib.connect(vibGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.4);
    g.gain.setValueAtTime(0.022, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    osc.connect(g).connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    g.connect(send).connect(echoIn);
    osc.start();
    vib.start();
    osc.stop(t + 2.1);
    vib.stop(t + 2.1);
  }

  heartbeat(urgency) {
    if (!this.started || !ctx) return;
    const vol = 0.12 + urgency * 0.08;
    this.blip(58, 0.11, vol, "sine");
    setTimeout(() => ctx && this.blip(50, 0.13, vol * 0.8, "sine"), 150);
  }

  chirp() {
    // melodia curta de passarinho (2-4 notas descendo)
    const notes = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < notes; i++) {
      const f = 2400 + Math.random() * 1600;
      setTimeout(() => {
        if (ctx) this.blip(f, 0.09, 0.025, "sine", f * 0.8, 0.25);
      }, i * 120);
    }
  }

  update(dt, s) {
    if (!this.started || !ctx) return;

    this.updateMusic(dt, s);

    // rajadas de vento: alvo sorteado de tempos em tempos, transição suave;
    // à noite a nevasca aperta e o vento sobe
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 3 + Math.random() * 6;
      this.gustTarget = Math.random();
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 0.6);
    const base = 0.024 + s.night * 0.014 + (s.sprint && s.moving ? 0.01 : 0);
    this.windLow.gain.value = base + this.gust * 0.022;
    this.windHigh.gain.value = 0.003 + this.gust * 0.011 + s.night * 0.004;

    // coruja distante à noite
    if (s.night > 0.5) {
      this.owlTimer -= dt;
      if (this.owlTimer <= 0) {
        this.owlTimer = 8 + Math.random() * 14;
        this.blip(340, 0.28, 0.028, "sine", 300, 0.5);
        setTimeout(() => ctx && this.blip(300, 0.4, 0.028, "sine", 260, 0.5), 350);
      }
      // lobos uivando longe
      this.wolfTimer -= dt;
      if (this.wolfTimer <= 0) {
        this.wolfTimer = 22 + Math.random() * 30;
        this.wolfHowl();
      }
    }

    // pássaros de dia
    if (s.night < 0.3) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 4 + Math.random() * 8;
        this.chirp();
      }
    }

    // passos: neve crocante ou gelo duro
    if (s.moving && s.onGround) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = s.sprint ? 0.3 : 0.46;
        if (s.onIce) this.stepIce(s.sprint);
        else this.stepSnow(s.sprint);
      }
    } else {
      this.stepTimer = 0;
    }

    // fogueira: crepitar contínuo + estalos ocasionais
    if (s.fireDist != null && s.fireDist < 9) {
      const prox = 1 - s.fireDist / 9;
      this.crackleTimer -= dt;
      if (this.crackleTimer <= 0) {
        this.crackleTimer = 0.12 + Math.random() * 0.35;
        this.noiseBurst(0.04 + Math.random() * 0.04, 0.05 * prox, 900 + Math.random() * 1200);
      }
      this.popTimer -= dt;
      if (this.popTimer <= 0) {
        this.popTimer = 1.5 + Math.random() * 3;
        this.blip(420 + Math.random() * 260, 0.06, 0.05 * prox, "square", 120);
      }
    }

    // urso perseguindo: rosnados repetidos, mais altos quanto mais perto
    if (s.bearChasing && s.bearDist < 26) {
      this.bearRoarTimer -= dt;
      if (this.bearRoarTimer <= 0) {
        this.bearRoarTimer = 2.5 + Math.random() * 3;
        this.roarSmall(1 - s.bearDist / 26);
      }
    }

    // coração acelerado: vida baixa ou urso na cola
    const danger = s.lowHealth || (s.bearChasing && s.bearDist < 15);
    if (danger) {
      const urgency = s.lowHealth ? 1 : 1 - s.bearDist / 15;
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.95 - urgency * 0.35;
        this.heartbeat(urgency);
      }
    }
  }
}
