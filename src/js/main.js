import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CONFIG } from "./config.js";
import { Input } from "./input.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { HUD } from "./hud.js";
import { Ambience } from "./audio.js";
import { TouchControls, isTouchDevice } from "./touch.js";
import { WeaponInventory } from "./weapons.js";
import { SpeedrunTimer } from "./speedrun.js";
import {
  fetchLeaderboard,
  submitScore,
  formatTimeMs,
  getTopEntry,
  exportLeaderboardJson,
} from "./leaderboard.js";
import { runSplash, dismissSplash } from "./splash.js";
import { runSkinPicker, applySkinToPlayer, loadSkinId } from "./skins.js";
import { runDifficultyPicker, getDifficulty } from "./difficulty.js";
import { runMapModePicker, getMapMode } from "./mapMode.js";
import { WebRtcRoom } from "./net/webrtcRoom.js";
import { CoopSession } from "./net/coopSession.js";
import { Tutorial } from "./tutorial.js";
import { TrapInventory } from "./traps.js";
import {
  hasMidRunSave,
  loadMidRunSave,
  clearMidRunSave,
  writeMidRunSave,
  captureGameState,
  applyGameState,
} from "./save.js";
import { dailySeed, dailyLabel, isDailyMode, setDailyMode } from "./daily.js";
import { unlockAchievement, listAchievements } from "./achievements.js";
import { playChefCutscene, updateCinematic, isCinematicActive } from "./cutscene.js";
import { GameChat } from "./chat.js";
import {
  DemoBot,
  wantsDemoFromUrl,
  clearDemoFlag,
  armDemoFromMenu,
} from "./demoBot.js";
import { SecretDungeon } from "./dungeon.js";
import { CraftBag } from "./crafting.js";
import { WorldEvents } from "./worldEvents.js";
import { HuskyPet, isHuskyEnabled, setHuskyEnabled } from "./pet.js";
import { MountManager } from "./mounts.js";

// Vinheta cinematográfica suave nas bordas da tela
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.55 },
    offset: { value: 1.15 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = smoothstep(0.8, 0.2, dot(uv, uv));
      color.rgb = mix(color.rgb * (1.0 - darkness), color.rgb, vig);
      gl_FragColor = color;
    }
  `,
};

class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.overlay = document.getElementById("overlay");
    this.overlayTitle = document.getElementById("overlay-title");
    this.overlayMsg = document.getElementById("overlay-msg");
    this.clickHint = document.getElementById("click-hint");
    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.ambience = new Ambience();
    this.ambience.onTrackChange = (name) => {
      if (name) this.hud?.showMsg(`♪ ${name}`, 2800);
    };
    this.ambience.onWhisper = () => {
      if (this.state !== "playing") return;
      this.hud?.showMsg("…alguém fala no vento", 3000);
    };
    this._ammoWarnAt = 0;
    this.weapons = new WeaponInventory();
    this.traps = new TrapInventory();
    this.craftBag = new CraftBag();
    this.worldEvents = new WorldEvents();
    this.pet = null;
    this.tutorial = null;
    this.demoBot = null;
    this.demoMode = false;
    this.speedrun = new SpeedrunTimer();
    this.leaderboard = [];
    this.touch = null;
    this.state = "loading";
    this.cameraMode = "first";
    this._orbitHintShown = false;
    this.helpOpen = false;
    this._helpFromPlaying = false;
    this.rankOpen = false;
    this._rankFromPlaying = false;
    this.releaseOpen = false;
    this._releaseFromPlaying = false;
    this.coop = null;
    this.coopRoom = null;
    this.difficultyId = "medium";
    this.difficulty = getDifficulty("medium");
    this.mapMode = "classic";
    this._saveAcc = 0;
    this._minimapAcc = 0;
    this.lowFx = isTouchDevice();
    // THREE.Timer (Clock está deprecated desde r183)
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.elapsed = 0;
    this.initThree();
    this.bindUI();
    this.chat = new GameChat(this);
    window.addEventListener("beforeunload", () => this.persistSave());
    if (this.lowFx) {
      this.touch = new TouchControls(this.input);
      this.cameraMode = "third";
    }
    this.loadLeaderboardChallenge();
    this._looping = false;
    // splash → depois inicia HUD / gameplay
    this.boot();
  }

  /** Um único rAF — começa cedo para a trilha tickar nos menus. */
  ensureLoop() {
    if (this._looping) return;
    this._looping = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  async boot() {
    this.state = "splash";
    this.hud.hide();
    this.setTouchUiVisible(false);
    this.ensureLoop();

    if (wantsDemoFromUrl()) {
      dismissSplash();
      await this.beginDemoRun({ fromUrl: true });
      return;
    }

    await runSplash({ minMs: 4200, maxMs: 10000, fadeMs: 800 });
    this.state = "skin";
    // Sempre exige escolher um personagem (rosto visível + preview girável)
    const unlockAudio = () => {
      this.ambience.unlockFromGesture();
    };
    const skinId = await runSkinPicker({ force: true, onGesture: unlockAudio });
    applySkinToPlayer(this.player, skinId);
    // Começa em 3ª pessoa para ver o personagem; mouse gira a câmera
    if (!this.input.mobile) this.setCameraMode("third");

    this.state = "difficulty";
    const diffId = await runDifficultyPicker({ onGesture: unlockAudio });
    // Guarda escolha; só aplica no mundo depois de Continuar/Novo (evita corromper save)
    this.difficultyId = getDifficulty(diffId).id;
    this.difficulty = getDifficulty(this.difficultyId);

    this.state = "mapMode";
    const mapId = await runMapModePicker({ onGesture: unlockAudio });
    this.mapMode = getMapMode(mapId).id;

    const coopChoice = await this.promptCoopMenu();
    if (coopChoice.mode === "demo") {
      await this.beginDemoRun({ fromMenu: true });
      return;
    }

    let resumeSave = null;

    if (coopChoice.mode === "solo") {
      if (hasMidRunSave()) {
        const choice = await this.promptContinueOrNew();
        if (choice === "continue") resumeSave = loadMidRunSave();
        else clearMidRunSave();
      }
    } else {
      clearMidRunSave();
      try {
        await this.beginCoop(coopChoice);
      } catch (err) {
        console.error(err);
        this.hud.showMsg(err.message || "Falha no co-op — modo solo.", 5000);
        this.coop = null;
        this.coopRoom = null;
      }
    }

    this.tutorial = new Tutorial(this);
    this.refreshTrapUI();
    if (resumeSave) {
      this.tutorial.skip();
      const seed = (resumeSave.seed >>> 0) || this.world.seed;
      applySkinToPlayer(this.player, loadSkinId() || "natan");
      this.mapMode = resumeSave.mapMode === "random" ? "random" : "classic";
      this.recreateWorld(seed, true, {
        difficulty: resumeSave.difficulty || this.difficultyId,
        mapMode: this.mapMode,
        thinPickups: false,
      });
      applySkinToPlayer(this.player, loadSkinId() || "natan");
      applyGameState(this, resumeSave);
      this.hud.showMsg("Expedição restaurada. Progresso auto-salva.", 4000);
    } else if (this.coop) {
      this.tutorial.skip();
    } else if (coopChoice.daily || isDailyMode()) {
      setDailyMode(true);
      this.mapMode = "classic"; // daily sempre classic (comparável)
      const seed = coopChoice.seed || dailySeed();
      this.recreateWorld(seed, true, { mapMode: "classic" });
      applySkinToPlayer(this.player, loadSkinId() || "natan");
      this.tutorial.skip();
      this.hud.showMsg(`Desafio do dia ${dailyLabel()} — mapa Classic compartilhado.`, 4500);
    } else {
      setDailyMode(false);
      // solo novo: regenera mundo com o mapa escolhido
      const seed = (Math.random() * 0xffffffff) >>> 0;
      this.recreateWorld(seed, true, {
        difficulty: this.difficultyId || diffId,
        mapMode: this.mapMode || "classic",
      });
      applySkinToPlayer(this.player, loadSkinId() || "natan");
      this.setDifficulty(this.difficultyId || diffId);
      if (this.mapMode === "random") {
        this.hud.showMsg("Mapa Random — terreno e base únicos desta seed.", 4000);
      }
    }
    this.bindWorldCombatHooks();
    this.world.onEnemySpawned = (enemy) => {
      playChefCutscene(this, enemy);
    };
    this.start();
  }

  /** Partida solo automática (espectável). */
  async beginDemoRun() {
    // Splash vem visível no HTML — sem isso ?demo=1 fica preso no launcher
    dismissSplash();
    for (const id of ["coop-menu", "skin-picker", "difficulty-picker", "map-mode-picker"]) {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
      }
    }
    this.mapMode = "classic";

    clearDemoFlag();
    clearMidRunSave();
    setDailyMode(false);
    this.demoMode = true;
    this.coop = null;
    this.coopRoom = null;
    try {
      this.ambience.unlockFromGesture();
    } catch {
      /* gesture pode falhar; demo segue sem áudio */
    }
    this.setDifficulty("easy");
    applySkinToPlayer(this.player, "natan");
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.recreateWorld(seed, true, {
      difficulty: "easy",
      thinPickups: false,
    });
    applySkinToPlayer(this.player, "natan");
    this.setCameraMode("third");
    this.tutorial = new Tutorial(this);
    this.tutorial.skip();
    this.refreshTrapUI();
    this.bindWorldCombatHooks();
    this.world.onEnemySpawned = (enemy) => {
      playChefCutscene(this, enemy);
    };
    this.demoBot = new DemoBot(this);
    this.start();
    this.setDemoBanner(true);
    this.hud.showMsg("DEMO automática — assista · Esc cancela", 5000);
    this.input.locked = true;
  }

  setDemoBanner(on) {
    const el = document.getElementById("demo-banner");
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", on ? "false" : "true");
    if (on) {
      const sub = el.querySelector(".demo-banner__status");
      if (sub) sub.textContent = this.demoBot?.status || "Rodando…";
    }
  }

  refreshDemoBanner() {
    if (!this.demoMode) return;
    const sub = document.querySelector("#demo-banner .demo-banner__status");
    if (sub && this.demoBot) sub.textContent = this.demoBot.status;
  }

  /** Esc / cancelar: para o bot e pausa (jogador assume). */
  cancelDemo() {
    if (!this.demoMode) return;
    this.demoMode = false;
    this.demoBot = null;
    this.setDemoBanner(false);
    this.input.clearKeys();
    this.hud.showMsg("Demo cancelada — você controla agora.", 3500);
  }

  /** Guest co-op: dano local vira evento para o host aplicar. */
  bindWorldCombatHooks() {
    if (!this.world) return;
    this.world.onDeferredHit = (netId, dmg) => {
      if (netId == null || !this.coop?.isGuest) return;
      this.coop.broadcastEvent("hit", { id: netId, dmg });
    };
  }

  /** Multiplicadores de dificuldade no Game + World (runtime). */
  setDifficulty(id, opts = {}) {
    this.difficultyId = getDifficulty(id).id;
    this.difficulty = getDifficulty(this.difficultyId);
    this.world?.applyDifficulty?.(this.difficultyId, opts);
  }

  /** Esconde joystick/look fullscreen durante menus (senão o toque não foca o input). */
  setTouchUiVisible(visible) {
    const root = document.getElementById("touch-controls");
    if (!root) return;
    root.hidden = !visible;
  }

  focusCoopCodeInput() {
    try {
      this.canvas?.blur?.();
    } catch {
      /* ignore */
    }
    const codeInput = document.getElementById("coop-code-input");
    if (!codeInput || codeInput.disabled) return;
    codeInput.focus({ preventScroll: true });
    codeInput.select?.();
  }

  /** Solo / criar sala / entrar — retorna { mode, room?, seed? }. */
  promptCoopMenu() {
    const el = document.getElementById("coop-menu");
    const status = document.getElementById("coop-status");
    const codeInput = document.getElementById("coop-code-input");
    const joinBlock = document.getElementById("coop-join-block");
    const stepMode = document.getElementById("coop-step-mode");
    const stepFriends = document.getElementById("coop-step-friends");
    const btnSolo = document.getElementById("btn-coop-solo");
    const btnDaily = document.getElementById("btn-coop-daily");
    const btnDemo = document.getElementById("btn-coop-demo");
    const btnFriends = document.getElementById("btn-coop-friends");
    const btnBack = document.getElementById("btn-coop-back");
    const btnCreate = document.getElementById("btn-coop-create");
    const btnRehost = document.getElementById("btn-coop-rehost");
    const btnRejoin = document.getElementById("btn-coop-rejoin");
    const btnJoin = document.getElementById("btn-coop-join");
    const btnPaste = document.getElementById("btn-coop-paste");
    const maxPlayersEl = document.getElementById("coop-max-players");
    const codeBox = document.getElementById("coop-code-box");
    const codeDisplay = document.getElementById("coop-code-display");
    const btnCopy = document.getElementById("btn-coop-copy");
    if (!el) return Promise.resolve({ mode: "solo" });
    this.setTouchUiVisible(false);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.state = "coop";

    const showMode = () => {
      if (stepMode) stepMode.hidden = false;
      if (stepFriends) stepFriends.hidden = true;
      if (status) status.textContent = "";
      if (codeBox) codeBox.hidden = true;
      if (joinBlock) joinBlock.hidden = false;
      if (codeInput) {
        codeInput.disabled = false;
        codeInput.readOnly = false;
        codeInput.value = "";
      }
      if (btnCreate) btnCreate.disabled = false;
      if (btnJoin) btnJoin.disabled = false;
      if (btnPaste) btnPaste.disabled = false;
      if (btnBack) btnBack.disabled = false;
      if (btnFriends) btnFriends.disabled = false;
      if (btnSolo) btnSolo.disabled = false;
      if (btnDaily) btnDaily.disabled = false;
      if (btnDemo) btnDemo.disabled = false;
      if (btnRehost) btnRehost.disabled = false;
      if (btnRejoin) btnRejoin.disabled = false;
    };
    const showFriends = () => {
      if (stepMode) stepMode.hidden = true;
      if (stepFriends) stepFriends.hidden = false;
      if (status) {
        status.textContent =
          "Crie a sala ou cole o código. Status: P2P → se falhar, relay HTTPS. 3P = só relay.";
      }
      if (joinBlock) joinBlock.hidden = false;
      try {
        const last = sessionStorage.getItem("neveLastRoom") || "";
        if (last && codeInput && !codeInput.value) codeInput.value = last;
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => this.focusCoopCodeInput());
    };
    showMode();

    return new Promise((resolve) => {
      const cleanup = () => {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        codeInput?.removeEventListener("keydown", onCodeKey);
        joinBlock?.removeEventListener("pointerdown", onJoinPointer);
        btnPaste?.removeEventListener("click", onPaste);
        btnSolo?.removeEventListener("click", onSolo);
        btnDaily?.removeEventListener("click", onDaily);
        btnDemo?.removeEventListener("click", onDemo);
        btnFriends?.removeEventListener("click", onFriends);
        btnBack?.removeEventListener("click", onBack);
        btnCreate?.removeEventListener("click", onCreate);
        btnRehost?.removeEventListener("click", onRehost);
        btnRejoin?.removeEventListener("click", onRejoin);
        btnJoin?.removeEventListener("click", onJoin);
        btnCopy?.removeEventListener("click", onCopy);
      };
      const onSolo = () => {
        setDailyMode(false);
        cleanup();
        resolve({ mode: "solo" });
      };
      const onDaily = () => {
        setDailyMode(true);
        cleanup();
        resolve({ mode: "solo", daily: true, seed: dailySeed() });
      };
      const onDemo = () => {
        armDemoFromMenu();
        cleanup();
        resolve({ mode: "demo" });
      };
      const onFriends = () => showFriends();
      const onBack = () => {
        if (btnCreate?.disabled && btnJoin?.disabled) return;
        showMode();
      };
      const onCreate = async () => {
        btnCreate.disabled = true;
        btnJoin.disabled = true;
        if (btnPaste) btnPaste.disabled = true;
        if (btnBack) btnBack.disabled = true;
        if (btnRehost) btnRehost.disabled = true;
        if (btnRejoin) btnRejoin.disabled = true;
        if (joinBlock) joinBlock.hidden = true;
        if (status) status.textContent = "Criando sala no servidor…";
        try {
          const room = new WebRtcRoom();
          room.onStatus = (m) => {
            if (status) status.textContent = m;
          };
          room.onCode = (code) => {
            if (codeBox) codeBox.hidden = false;
            if (codeDisplay) codeDisplay.textContent = code;
            if (status) {
              status.textContent = `Código ${code} — no outro aparelho: Com amigos → colar → Entrar.`;
            }
          };
          const maxPlayers = Math.min(4, Math.max(2, Number(maxPlayersEl?.value) || 2));
          // bit 31 da seed carrega o mapMode (random=1) — servidor não precisa mudar
          const baseSeed = isDailyMode() ? dailySeed() : this.world.seed;
          const seed = isDailyMode()
            ? baseSeed
            : ((baseSeed & 0x7fffffff) | (this.mapMode === "random" ? 0x80000000 : 0)) >>> 0;
          const { code } = await room.create(seed, { maxPlayers });
          await this.waitForRoomOpen(room);
          cleanup();
          resolve({ mode: "host", room, seed, code });
        } catch (err) {
          if (status) status.textContent = err.message || "Erro ao criar sala";
          btnCreate.disabled = false;
          btnJoin.disabled = false;
          if (btnPaste) btnPaste.disabled = false;
          if (btnBack) btnBack.disabled = false;
          if (btnRehost) btnRehost.disabled = false;
          if (btnRejoin) btnRejoin.disabled = false;
          if (joinBlock) joinBlock.hidden = false;
          this.focusCoopCodeInput();
        }
      };
      const onRehost = async () => {
        const code = (codeInput?.value || codeDisplay?.textContent || "").trim().toUpperCase();
        if (code.length < 4) {
          if (status) status.textContent = "Informe o código da sala para reconectar o host.";
          return;
        }
        let hostKey = "";
        try {
          hostKey = sessionStorage.getItem("neveHostKey:" + code) || "";
        } catch {
          /* ignore */
        }
        if (!hostKey) {
          if (status) {
            status.textContent =
              "Chave de host não encontrada neste aparelho — só quem criou a sala pode reconectar.";
          }
          return;
        }
        btnCreate.disabled = true;
        btnJoin.disabled = true;
        if (btnRehost) btnRehost.disabled = true;
        if (btnRejoin) btnRejoin.disabled = true;
        if (status) status.textContent = "Reconectando host…";
        try {
          const room = new WebRtcRoom();
          room.onStatus = (m) => {
            if (status) status.textContent = m;
          };
          const joined = await room.resumeHost(code, hostKey);
          await this.waitForRoomOpen(room);
          cleanup();
          resolve({ mode: "host", room, seed: joined.seed, code: joined.code });
        } catch (err) {
          if (status) status.textContent = err.message || "Falha ao reconectar host";
          btnCreate.disabled = false;
          btnJoin.disabled = false;
          if (btnRehost) btnRehost.disabled = false;
          if (btnRejoin) btnRejoin.disabled = false;
        }
      };
      const onRejoin = async () => {
        const code = (codeInput?.value || codeDisplay?.textContent || "").trim().toUpperCase();
        if (code.length < 4) {
          if (status) status.textContent = "Informe o código da sala para reconectar o convidado.";
          return;
        }
        let guestKey = "";
        try {
          guestKey = sessionStorage.getItem("neveGuestKey:" + code) || "";
        } catch {
          /* ignore */
        }
        if (!guestKey) {
          if (status) {
            status.textContent =
              "Chave de convidado não encontrada — só no aparelho que entrou antes. Use Entrar de novo.";
          }
          return;
        }
        btnCreate.disabled = true;
        btnJoin.disabled = true;
        if (btnRehost) btnRehost.disabled = true;
        if (btnRejoin) btnRejoin.disabled = true;
        if (status) status.textContent = "Reconectando convidado…";
        try {
          const room = new WebRtcRoom();
          room.onStatus = (m) => {
            if (status) status.textContent = m;
          };
          const joined = await room.resumeGuest(code, guestKey);
          await this.waitForRoomOpen(room);
          cleanup();
          resolve({ mode: "guest", room, seed: joined.seed, code: joined.code });
        } catch (err) {
          if (status) status.textContent = err.message || "Falha ao reconectar convidado";
          btnCreate.disabled = false;
          btnJoin.disabled = false;
          if (btnRehost) btnRehost.disabled = false;
          if (btnRejoin) btnRejoin.disabled = false;
        }
      };
      const onJoin = async () => {
        const code = (codeInput?.value || "").trim().toUpperCase();
        if (code.length < 4) {
          if (status) status.textContent = "Digite o código (ex: TBVKQ3).";
          this.focusCoopCodeInput();
          return;
        }
        btnCreate.disabled = true;
        btnJoin.disabled = true;
        if (btnPaste) btnPaste.disabled = true;
        if (btnBack) btnBack.disabled = true;
        if (btnRehost) btnRehost.disabled = true;
        if (btnRejoin) btnRejoin.disabled = true;
        if (codeInput) codeInput.disabled = true;
        if (status) status.textContent = "Entrando na sala…";
        try {
          const room = new WebRtcRoom();
          room.onStatus = (m) => {
            if (status) status.textContent = m;
          };
          const joined = await room.join(code);
          await this.waitForRoomOpen(room);
          cleanup();
          resolve({ mode: "guest", room, seed: joined.seed, code: joined.code });
        } catch (err) {
          if (status) status.textContent = err.message || "Erro ao entrar";
          btnCreate.disabled = false;
          btnJoin.disabled = false;
          if (btnPaste) btnPaste.disabled = false;
          if (btnBack) btnBack.disabled = false;
          if (btnRehost) btnRehost.disabled = false;
          if (btnRejoin) btnRejoin.disabled = false;
          if (codeInput) codeInput.disabled = false;
          this.focusCoopCodeInput();
        }
      };
      const onPaste = async () => {
        try {
          const text = (await navigator.clipboard.readText()).trim().toUpperCase();
          if (!text) {
            if (status) status.textContent = "Área de transferência vazia — digite o código.";
            this.focusCoopCodeInput();
            return;
          }
          if (codeInput) codeInput.value = text.replace(/[^A-Z0-9]/g, "").slice(0, 8);
          if (status) status.textContent = "Código colado — toque em Entrar.";
          this.focusCoopCodeInput();
        } catch {
          if (status) status.textContent = "Não deu para colar — clique no campo e Ctrl+V.";
          this.focusCoopCodeInput();
        }
      };
      const onCodeKey = (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onJoin();
        }
      };
      const onJoinPointer = (e) => {
        if (e.target?.closest?.("button")) return;
        if (e.target === codeInput) return;
        this.focusCoopCodeInput();
      };
      const onCopy = async () => {
        const code = codeDisplay?.textContent?.trim();
        if (!code || code.includes("—")) return;
        try {
          await navigator.clipboard.writeText(code);
          if (status) status.textContent = `Código ${code} copiado — cole no outro aparelho.`;
        } catch {
          if (status) status.textContent = `Código: ${code} (selecione e Ctrl+C)`;
        }
      };
      btnCopy?.addEventListener("click", onCopy);
      codeInput?.addEventListener("keydown", onCodeKey);
      joinBlock?.addEventListener("pointerdown", onJoinPointer);
      btnPaste?.addEventListener("click", onPaste);
      btnSolo?.addEventListener("click", onSolo);
      btnDaily?.addEventListener("click", onDaily);
      btnDemo?.addEventListener("click", onDemo);
      btnFriends?.addEventListener("click", onFriends);
      btnBack?.addEventListener("click", onBack);
      btnCreate?.addEventListener("click", onCreate);
      btnRehost?.addEventListener("click", onRehost);
      btnRejoin?.addEventListener("click", onRejoin);
      btnJoin?.addEventListener("click", onJoin);
    });
  }

  waitForRoomOpen(room, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      if (room.isOpen) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        room.close("timeout");
        reject(
          new Error(
            "Tempo esgotado. Confira o código, a rede e se a HostGator (api/signal.php) está atualizada."
          )
        );
      }, timeoutMs);
      const prevOpen = room.onOpen;
      const prevClose = room.onClose;
      room.onOpen = () => {
        clearTimeout(timer);
        prevOpen?.();
        resolve();
      };
      room.onClose = (why) => {
        clearTimeout(timer);
        prevClose?.(why);
        const hint =
          why === "room-gone"
            ? "Sala sumiu — peça ao host criar outra."
            : `Conexão fechada (${why}). Tente Entrar de novo ou Reconectar.`;
        reject(new Error(hint));
      };
    });
  }

  async beginCoop(choice) {
    const authority = choice.mode === "host";
    // decodifica mapMode do bit 31 da seed (host embutiu na criação da sala)
    const seed = choice.seed >>> 0;
    this.mapMode = seed & 0x80000000 ? "random" : "classic";
    this.recreateWorld(seed, authority);
    applySkinToPlayer(this.player, loadSkinId() || "natan");
    this.coopRoom = choice.room;
    this.coop = new CoopSession(this, choice.room);
    if (choice.room.isOpen) this.coop.onConnected();
    else {
      choice.room.onOpen = () => this.coop.onConnected();
    }
  }

  /** Overlay in-run: reconectar sem voltar ao menu de co-op. */
  showCoopReconnect(why, role) {
    this._coopReconnectRole = role || this.coop?.role || "guest";
    const el = document.getElementById("coop-reconnect-overlay");
    const status = document.getElementById("coop-reconnect-status");
    if (status) {
      status.textContent =
        why === "room-gone"
          ? "Sala sumiu no servidor."
          : `Conexão caiu (${why || "rede"}).`;
    }
    if (el) {
      el.hidden = false;
      el.setAttribute("aria-hidden", "false");
    }
    if (!this.input?.mobile) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    if (this.state === "playing") {
      this.state = "paused";
      this.speedrun?.pause?.();
    }
  }

  hideCoopReconnect() {
    const el = document.getElementById("coop-reconnect-overlay");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
  }

  async reconnectCoopInPlace() {
    const status = document.getElementById("coop-reconnect-status");
    let code = "";
    try {
      code = (sessionStorage.getItem("neveLastRoom") || "").trim().toUpperCase();
    } catch {
      /* ignore */
    }
    if (code.length < 4) {
      if (status) status.textContent = "Código da sala não encontrado neste aparelho.";
      return;
    }
    const role = this._coopReconnectRole || "guest";
    let key = "";
    try {
      key =
        role === "host"
          ? sessionStorage.getItem("neveHostKey:" + code) || ""
          : sessionStorage.getItem("neveGuestKey:" + code) || "";
    } catch {
      /* ignore */
    }
    if (!key) {
      if (status) {
        status.textContent =
          role === "host"
            ? "Chave de host ausente — use o menu Com amigos."
            : "Chave de convidado ausente — use Entrar no menu.";
      }
      return;
    }
    if (status) status.textContent = "Reconectando…";
    const btn = document.getElementById("btn-coop-reconnect-now");
    if (btn) btn.disabled = true;
    try {
      const room = new WebRtcRoom();
      room.onStatus = (m) => {
        if (status) status.textContent = m;
      };
      if (role === "host") await room.resumeHost(code, key);
      else await room.resumeGuest(code, key);
      await this.waitForRoomOpen(room);
      this.coop?.disposeRemotes?.();
      try {
        this.coopRoom?.close?.("replaced");
      } catch {
        /* ignore */
      }
      this.coopRoom = room;
      this.coop = new CoopSession(this, room);
      if (room.isOpen) this.coop.onConnected();
      else room.onOpen = () => this.coop.onConnected();
      this.hideCoopReconnect();
      if (this.state === "paused") this.resume();
      this.hud?.showMsg("Co-op reconectado — mundo intacto.", 3200);
    } catch (err) {
      if (status) status.textContent = err.message || "Falha ao reconectar";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** Recria mundo/player com seed (co-op guest/host alinhados). */
  recreateWorld(seed, authority = true, diffOpts = null) {
    const preserve = new Set([
      this.camera,
      this.hemi,
      this.ambient,
      this.sunLight,
      this.sunLight.target,
      this.moonLight,
      this.skyDome,
    ]);
    for (const child of [...this.scene.children]) {
      if (!preserve.has(child)) this.scene.remove(child);
    }
    // limpa viewmodel órfão na câmera
    for (const c of [...this.camera.children]) this.camera.remove(c);

    this.pet?.dispose?.();
    this.pet = null;
    if (diffOpts?.mapMode) this.mapMode = diffOpts.mapMode === "random" ? "random" : "classic";
    this.world = new World(this.scene, {
      seed,
      authority,
      lowFx: this.lowFx,
      mapMode: this.mapMode || "classic",
    });
    this.dungeon = new SecretDungeon(this.world, this.scene);
    this.player = new Player(this.camera, this.scene, this.world, this.world.getSpawn());
    this.mounts = new MountManager(this.world, this.scene);
    this.syncPet();
    this.worldEvents?.reset?.();
    if (!diffOpts?.keepCraft) this.craftBag = new CraftBag();
    this._botoCutDone = false;
    this._pandaCutDone = false;
    this._saciCutDone = false;
    this._trexCutDone = false;
    this.setCameraMode(this.cameraMode);
    this.initSurvival();
    if (diffOpts) {
      this.setDifficulty(diffOpts.difficulty || this.difficultyId, {
        thinPickups: diffOpts.thinPickups !== false,
      });
    } else if (this.difficultyId) {
      this.setDifficulty(this.difficultyId);
    }
    this.bindWorldCombatHooks();
  }

  /** Menu Continuar / Novo jogo. */
  promptContinueOrNew() {
    const el = document.getElementById("continue-menu");
    const summary = document.getElementById("continue-summary");
    const data = loadMidRunSave();
    if (summary && data) {
      const mins = Math.floor((data.speedrunMs || 0) / 60000);
      const secs = Math.floor(((data.speedrunMs || 0) % 60000) / 1000);
      summary.textContent = `Baú ${data.deposited ?? 0}/10 · mochila ${data.carried ?? 0} · vida ${Math.round(data.health ?? 0)} · tempo ${mins}:${String(secs).padStart(2, "0")}`;
    }
    if (!el) return Promise.resolve("new");
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.state = "continue";
    return new Promise((resolve) => {
      const done = (choice) => {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        btnCont?.removeEventListener("click", onCont);
        btnNew?.removeEventListener("click", onNew);
        resolve(choice);
      };
      const onCont = () => done("continue");
      const onNew = () => done("new");
      const btnCont = document.getElementById("btn-continue-game");
      const btnNew = document.getElementById("btn-new-game");
      btnCont?.addEventListener("click", onCont);
      btnNew?.addEventListener("click", onNew);
    });
  }

  persistSave() {
    if (this.coop) return; // co-op não usa save mid-run local
    if (this.difficulty?.hardcore) return; // hardcore: sem mid-run
    // playing / paused / dead (pós-queda com loot no chão)
    if (this.state !== "playing" && this.state !== "paused" && this.state !== "dead") return;
    writeMidRunSave(captureGameState(this));
  }

  /** Vitória: baú + craft na base (cerca) conta como suprimento investido. */
  winProgress() {
    return (this.deposited || 0) + (this.baseCrafted || 0);
  }

  checkWin() {
    if (this.winProgress() >= this.world.itemsTotal) this.win();
  }

  async openSkinPickerFromPause() {
    if (this.state !== "paused") return;
    this.overlay.hidden = true;
    const skinId = await runSkinPicker({
      force: true,
      onGesture: () => this.ambience.unlockFromGesture(),
    });
    applySkinToPlayer(this.player, skinId);
    this.hud.showMsg(`Skin: ${CONFIG.skins[skinId]?.name || skinId}`, 2200);
    this.overlay.hidden = false;
  }

  async loadLeaderboardChallenge() {
    const data = await fetchLeaderboard(10);
    this.leaderboard = data.entries || [];
    this.leaderboardSeason = data.season || data.currentSeason;
    const top = getTopEntry(this.leaderboard);
    this.speedrun.setRecord(top);
    if (top) {
      this.hud.showMsg(
        `Recorde atual: ${top.name} — ${formatTimeMs(top.timeMs)}. Bata esse tempo para ser Top 1!`,
        5500
      );
      this.hud.setGhost({
        label: `Top 1 · ${top.name}`,
        countdown: formatTimeMs(top.timeMs),
        urgent: false,
        failed: false,
      });
    } else if (!this.input?.mobile) {
      this.hud.setGhost({
        label: "Sem recorde ainda",
        countdown: "Seja o 1º!",
        urgent: false,
        failed: false,
      });
    } else {
      this.hud.setGhost({ hidden: true });
    }
  }

  initThree() {
    const gfx = this.lowFx ? CONFIG.mobileGfx || {} : null;
    const maxDpr = gfx?.maxDpr ?? 2;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: gfx ? !!gfx.antialias : true,
      powerPreference: this.lowFx ? "high-performance" : "default",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Desktop: sombras suaves. Celular: desliga — 2048 PCF + bloom engasga Android.
    const shadowsOn = gfx ? !!gfx.shadows : true;
    this.renderer.shadowMap.enabled = shadowsOn;
    // PCFSoftShadowMap deprecated (r183+): PCFShadowMap já é soft
    this.renderer.shadowMap.type = shadowsOn ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.colors.skyDay);
    // névoa fria e fechada: sensação de nevasca no horizonte
    // celular: horizonte um pouco mais perto = menos fill-rate
    this._baseFogNear = this.lowFx ? 22 : 28;
    this._baseFogFar = this.lowFx ? 85 : 110;
    this.scene.fog = new THREE.Fog(CONFIG.colors.skyDay, this._baseFogNear, this._baseFogFar);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      this.lowFx ? 220 : 500
    );
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xdceaff, 0x9aa8b4, 0.9);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 0.8);
    this.sunLight.castShadow = shadowsOn;
    if (shadowsOn) {
      // 2048 + bloom + neve engasgava o Chrome; 1024 basta na neve
      const mapSize = gfx?.shadowMapSize || 1024;
      this.sunLight.shadow.mapSize.set(mapSize, mapSize);
      this.sunLight.shadow.camera.left = -60;
      this.sunLight.shadow.camera.right = 60;
      this.sunLight.shadow.camera.top = 60;
      this.sunLight.shadow.camera.bottom = -60;
      this.sunLight.shadow.camera.near = 1;
      this.sunLight.shadow.camera.far = 400;
      this.sunLight.shadow.bias = -0.0006;
    }
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.moonLight = new THREE.DirectionalLight(0x8ea8d8, 0);
    this.scene.add(this.moonLight);

    // temps reutilizáveis (evita `new Color/Vector3` todo frame → GC no Android)
    this._tmpColorA = new THREE.Color();
    this._tmpColorB = new THREE.Color();
    this._tmpSunDir = new THREE.Vector3();

    this.buildSky();

    // relógio do mundo: 0 = nascer do sol, 0.25 = meio-dia, 0.5 = pôr do sol
    this.dayTime = 0.12;
    // estações: começa no inverno (tema neve) e cicla a cada N dias
    this.seasonIndex = (CONFIG.world.seasons?.length || 1) - 1;
    this.seasonDayAcc = 0;
    this._prevDayTime = this.dayTime;

    this.world = new World(this.scene, { lowFx: this.lowFx });
    this.world.applySeason?.(this.getSeason());
    this.dungeon = new SecretDungeon(this.world, this.scene);
    this.player = new Player(
      this.camera,
      this.scene,
      this.world,
      this.world.getSpawn()
    );
    this.mounts = new MountManager(this.world, this.scene);
    this.syncPet();

    this.initSurvival();
    this.buildPostFX();
    window.addEventListener("resize", () => this.onResize());
  }

  /** Spawna/remove o husky conforme preferência (default: off). */
  syncPet() {
    const want = isHuskyEnabled();
    if (want && !this.pet && this.scene && this.world) {
      this.pet = new HuskyPet(this.scene, this.world);
      if (this.player?.position) {
        this.pet.pos.set(
          this.player.position.x + 2,
          0,
          this.player.position.z + 2
        );
      }
    } else if (!want && this.pet) {
      this.pet.dispose?.();
      this.pet = null;
    }
    this.refreshPetButton();
  }

  togglePet() {
    const on = setHuskyEnabled(!isHuskyEnabled());
    this.syncPet();
    this.hud?.showMsg(
      on ? "Husky ligado — ele fareja loot perto de você." : "Husky desligado.",
      2400
    );
    return on;
  }

  refreshPetButton() {
    const btn = document.getElementById("btn-pet-toggle");
    if (!btn) return;
    const on = isHuskyEnabled();
    btn.textContent = on ? "Husky: ligado" : "Husky: desligado";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  initSurvival() {
    const s = CONFIG.survival;
    this.health = s.maxHealth;
    this.warmth = s.maxWarmth;
    this.carried = 0;
    this.deposited = 0;
    this.baseCrafted = 0;
    this.attackCd = 0;
    this.ended = false;
    this._coldWarned = false;
    this._freezingWarned = false;

    this.world.onEnemyAttack = (dmg, dir, enemy) => this.onEnemyAttack(dmg, dir, enemy);
    this.world.onEnemySpawned = (enemy) => {
      playChefCutscene(this, enemy);
      if (this.state !== "playing") return;
      this.hud.showMsg(`${enemy.label} surgiu na neve…`, 2800);
    };
    this.world.onEnemyEvent = (ev, enemy) => {
      if (ev === "growl") {
        this.ambience.growl();
        const label = enemy?.label || "Um inimigo";
        this.hud.showMsg(`${label} te viu. Corra ou lute!`);
      } else if (ev === "hurt") {
        const now = performance.now();
        if (!this._hurtSfxAt || now - this._hurtSfxAt > 90) {
          this._hurtSfxAt = now;
          this.ambience.npcHurt();
        }
      } else if (ev === "teleport") {
        this.ambience.teleportWhoosh();
      } else if (ev === "gunfire") {
        this.ambience.gunfireBurst();
      } else if (ev === "npc_fight") {
        if (Math.random() < 0.08) {
          this.hud.showMsg("Inimigos estão brigando entre si!", 2200);
        }
      } else if (ev === "dead") {
        const drops = enemy?._lastDrops || [];
        if (enemy?.type === "boto") this.toastAchievement(unlockAchievement("boto_kill"));
        if (enemy?.type === "ptero") this.toastAchievement(unlockAchievement("ptero_kill"));
        if (enemy?.type === "bear_elite") {
          this.ambience.victory();
          this.hud.showMsg(
            drops.length
              ? "Urso alfa derrotado! Pegue o troféu e as armas no chão."
              : "Urso alfa derrotado! Pegue o troféu."
          );
        } else {
          this.ambience.bearHit();
          this.hud.showMsg(
            drops.length
              ? `${enemy?.label || "Inimigo"} abatido — loot no chão!`
              : `${enemy?.label || "Inimigo"} abatido.`,
            2600
          );
        }
      }
    };
    this.world.onExplosion = () => this.ambience.explosion();
    this.world.onProjectileHit = () => this.ambience.bearHit();
    this.world.onAurora = (ev) => {
      if (ev === "start") {
        this.ambience.auroraChime?.();
        this.hud.showMsg("✦ Aurora boreal… olhe o céu!", 4500);
      } else if (ev === "gift") {
        this.hud.showMsg("Um cristal de gelo caiu perto de você!", 3800);
      }
    };

    this.weapons = new WeaponInventory();
    this.traps = new TrapInventory();
    this.hud.setHealth(this.health, s.maxHealth);
    this.hud.setWarmth(this.warmth, s.maxWarmth);
    this.hud.setItems(0, 0, this.world.itemsTotal);
    this.hud.onEquip = (id) => this.equipWeapon(id);
    this.refreshInventoryUI();
    this.refreshTrapUI();
  }

  refreshTrapUI() {
    this.hud.setTraps(this.traps.statusLine({ mobile: !!this.input?.mobile }));
  }

  cycleTrap() {
    this.traps.cycle(1);
    this.refreshTrapUI();
    this.hud.showMsg(`Armadilha: ${this.traps.current.name}`, 1400);
  }

  /** Perto da fogueira: receita de materiais → ammo/trap; senão cerca clássica. */
  tryCraftFence() {
    const fire = this.world.campfirePos;
    if (!fire) return;
    const dist = this.player.position.distanceTo(fire);
    if (dist > (CONFIG.trapPlaceMaxDist || 35)) {
      this.hud.showMsg("Craft só perto da fogueira da base.", 2200);
      return;
    }

    // prioriza armadura se há montaria domada sem proteção e nenhuma em estoque
    const wantArmor =
      (this.mounts?.tames || []).some((e) => !e.mountArmor) &&
      (this.mounts?.armorStock || 0) === 0;
    const recipe =
      (wantArmor && this.craftBag?.armorRecipe?.()) || this.craftBag?.firstAvailable?.();
    if (recipe) {
      const result = this.craftBag.craft(recipe);
      if (result) {
        if (result.ammoType) this.weapons.addAmmo(result.ammoType, result.amount || 1);
        if (result.mountArmor) {
          this.mounts.armorStock += result.mountArmor;
          this.hud.showMsg(`Armadura pronta — aperte E na montaria domada para equipar.`, 3600);
        }
        if (result.trapId) {
          this.traps.add(result.trapId, result.amount || 1);
          this.traps.selected = result.trapId;
        }
        this.refreshInventoryUI();
        this.refreshTrapUI();
        this.persistSave();
        this.hud.showMsg(`Craft: ${result.name} · ${this.craftBag.statusLine()}`, 3600);
        this.toastAchievement(unlockAchievement("craft_ammo"));
        return;
      }
    }

    if (this.carried < 1) {
      this.hud.showMsg(
        `Sem receita pronta (${this.craftBag?.statusLine?.() || "sem materiais"}). Ou 1 suprimento da mochila → cerca.`,
        3800
      );
      return;
    }
    this.carried--;
    // Conta para a vitória (suprimento investido na base) — evita soft-lock
    this.baseCrafted = (this.baseCrafted || 0) + 1;
    this.traps.add("fence", 1);
    this.traps.selected = "fence";
    this.hud.setItems(this.carried, this.deposited, this.world.itemsTotal);
    this.refreshTrapUI();
    this.persistSave();
    this.hud.showMsg(
      this.input.mobile
        ? `Craft: 1 cerca (${this.winProgress()}/${this.world.itemsTotal} no progresso). Coloque com ⋯ → ✚.`
        : `Craft: 1 cerca (${this.winProgress()}/${this.world.itemsTotal} no progresso). Coloque com F.`,
      3600
    );
    this.tutorial?.notify("trap");
    this.toastAchievement(unlockAchievement("craft_fence"));
    this.checkWin();
  }

  tryPlaceTrap() {
    if (!this.traps.canPlace()) {
      this.hud.showMsg("Sem armadilhas. Pegue no mapa ou craft (C) na fogueira.", 2600);
      return;
    }
    const maxD = CONFIG.trapPlaceMaxDist || 35;
    const fireDist = this.player.position.distanceTo(this.world.campfirePos);
    if (fireDist > maxD) {
      this.hud.showMsg("Armadilhas só perto da base (fogueira).", 2600);
      return;
    }
    const dir = this.player.lookDirection.clone().setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    else dir.normalize();
    const pos = this.player.position.clone().addScaledVector(dir, 2.2);
    if (!this.traps.consume()) return;
    const ok = this.world.placeTrap(this.traps.selected, pos.x, pos.z);
    if (!ok) {
      this.traps.add(this.traps.selected, 1);
      this.hud.showMsg("Não deu para colocar aqui.", 2000);
    } else {
      this.hud.showMsg(`${this.traps.current.name} colocada!`, 2000);
      this.tutorial?.notify("trap");
      this.persistSave();
    }
    this.refreshTrapUI();
  }

  equipWeapon(id) {
    if (!this.weapons.equip(id)) {
      this.hud.showMsg("Arma ainda não encontrada no mapa.", 2000);
      return false;
    }
    this.cancelWeaponCharge();
    const w = this.weapons.current;
    this.player.setHeldWeapon(w.id);
    this.refreshInventoryUI();
    this.hud.showMsg(`Equipado: ${w.name}`, 1600);
    return true;
  }

  cancelWeaponCharge() {
    this._weaponCharge = 0;
    this._charging = false;
    this._chargeTickAcc = 0;
    this.hud.setCharge(null);
  }

  /** Próxima/anterior arma desbloqueada (touch, scroll). */
  cycleWeapon(dir = 1) {
    this.cancelWeaponCharge();
    this.weapons.cycle(dir);
    this.player.setHeldWeapon(this.weapons.current.id);
    this.refreshInventoryUI();
    this.hud.showMsg(`Equipado: ${this.weapons.current.name}`, 1600);
    this.tutorial?.notify("equip");
  }

  refreshInventoryUI() {
    this.hud.renderInventory(this.weapons.slots());
  }

  updateGhostHud() {
    const sr = this.speedrun;
    if (sr.recordMs == null) {
      // No celular some o placeholder — só ocupa espaço e atrapalha
      if (this.input?.mobile) {
        this.hud.setGhost({ hidden: true });
        return;
      }
      if (!sr.started) return;
      this.hud.setGhost({
        label: "Sem recorde",
        countdown: "Abra o caminho!",
        failed: false,
        urgent: false,
      });
      return;
    }

    if (sr.consumeGhostFailEvent()) {
      this.hud.showMsg(
        "Tempo do Top 1 esgotado — você ainda pode terminar e entrar no ranking!",
        5000
      );
    }

    if (sr.ghostFailed) {
      this.hud.setGhost({
        label: `Recorde de ${sr.recordName} perdido`,
        countdown: formatTimeMs(sr.recordMs),
        failed: true,
        urgent: false,
      });
      return;
    }

    const left = sr.ghostRemainingMs;
    const urgent = left != null && left < 60000;
    this.hud.setGhost({
      label: sr.started
        ? `Bata ${sr.recordName} (${formatTimeMs(sr.recordMs)})`
        : `Recorde: ${sr.recordName}`,
      countdown: sr.started ? formatTimeMs(Math.max(0, left)) : formatTimeMs(sr.recordMs),
      urgent,
      failed: false,
    });
  }

  onEnemyAttack(dmg, dir, enemy) {
    if (this.ended) return;
    // Cobertura: pedra, árvore, baú, cabana… bloqueiam LOS (melee e tiros)
    if (enemy?.mesh && this.world?.rayHitsCover) {
      const origin = enemy.mesh.position.clone();
      origin.y += 1.1 * (enemy.cfg?.scale || 1);
      const aim = this.player.position.clone();
      aim.y += 1.15;
      const to = new THREE.Vector3().subVectors(aim, origin);
      const dist = to.length();
      if (dist > 0.25) {
        const blocked = this.world.rayHitsCover(origin, to.normalize(), dist - 0.15);
        if (blocked) {
          if (!this._coverMsgT || this.elapsed - this._coverMsgT > 2.2) {
            this._coverMsgT = this.elapsed;
            this.hud.showMsg("Protegido atrás do obstáculo!", 1400);
          }
          return;
        }
      }
    }
    this.health = Math.max(0, this.health - dmg);
    this.player.applyKnockback(dir, enemy?.type === "wolf" ? 7 : 9);
    this.hud.flashDamage();
    if (enemy?.cfg?.ai === "gunner") this.ambience.gunfireBurst();
    else this.ambience.npcBite();
    this.ambience.hurt();
    this.hud.setHealth(this.health, CONFIG.survival.maxHealth);
    if (this.health <= 0) {
      const who = enemy?.label || "A neve";
      this.die(`${who} foi mais forte desta vez.`);
    }
  }

  onBearAttack(dmg, dir) {
    this.onEnemyAttack(dmg, dir, null);
  }

  /** Itens na mochila voltam ao chão (baú permanece). Evita soft-lock da vitória. */
  dropCarriedOnDeath() {
    const n = this.carried | 0;
    if (n <= 0) return;
    const p = this.player.position;
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.max(n, 1)) * Math.PI * 2 + i * 0.35;
      const r = 1.3 + (i % 3) * 0.35;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      const pos = new THREE.Vector3(x, this.world.groundHeight(x, z) + 0.15, z);
      this.world.spawnGroundLoot({
        name: "Suprimento (caído)",
        color: 0xffd75a,
        pos,
        countsForWin: true,
        discovered: true,
      });
    }
    this.carried = 0;
    this.hud.setItems(this.carried, this.deposited, this.world.itemsTotal);
  }

  die(reason) {
    if (this.ended) return;
    this.ended = true;
    this.state = "dead";
    this.mounts?.dismount(this.player, { keepPos: true });
    this.closeHelp(true);
    this.closeReleaseNotes(true);
    this.closeRank(true);
    // morreu na dungeon: volta para a entrada (loot cai lá fora, dungeon reseta)
    if (this.dungeon?.active) this.dungeon.leave(this, { died: true });
    this.dropCarriedOnDeath();
    const hardcore = !!this.difficulty?.hardcore;
    if (hardcore) {
      clearMidRunSave();
    } else {
      this.persistSave();
    }
    document.exitPointerLock();
    this.input.clearKeys();
    if (this.clickHint) this.clickHint.hidden = true;
    this.overlayTitle.textContent = hardcore ? "Hardcore — fim da linha" : "Você morreu";
    this.overlayMsg.textContent = hardcore
      ? `${reason} Sem segunda chance. Sua expedição acabou.`
      : `${reason} O que você carregava caiu no chão. Itens no baú estão seguros. Renasça na base.`;
    const btnResume = document.getElementById("btn-resume");
    if (btnResume) {
      if (hardcore) {
        btnResume.textContent = "Nova partida";
        btnResume.onclick = () => this.restart();
      } else {
        btnResume.textContent = "Renascer na base";
      }
    }
    const btnSkin = document.getElementById("btn-skin");
    if (btnSkin) btnSkin.hidden = true;
    this.overlay.hidden = false;
  }

  toastAchievement(def) {
    if (!def) return;
    this.hud?.showMsg(`Conquista: ${def.title} — ${def.desc}`, 4000);
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    this.state = "won";
    clearMidRunSave();
    if (this.coop?.isHost) this.coop.broadcastEvent("win", {});
    const ms = this.speedrun.stop();
    this.ambience.victory();
    this.toastAchievement(unlockAchievement("first_win"));
    if (this.difficultyId === "hard") this.toastAchievement(unlockAchievement("hard_win"));
    if (this.difficultyId === "hardcore" || this.difficulty?.hardcore) {
      this.toastAchievement(unlockAchievement("hardcore_win"));
    }
    if (isDailyMode()) this.toastAchievement(unlockAchievement("daily_win"));
    if (this.coop) this.toastAchievement(unlockAchievement("coop_win"));
    this.toastAchievement(unlockAchievement("full_deposit"));
    document.exitPointerLock();
    this.input.clearKeys();
    if (this.clickHint) this.clickHint.hidden = true;
    this.overlayTitle.textContent = "Você sobreviveu!";
    this.overlayMsg.textContent =
      "Você entrou para a história da neve — caminho aberto por Jorge (1º a zerar) e Caio (1º a testar). Envie seu tempo ao ranking.";
    document.getElementById("btn-resume").hidden = true;
    const btnSkin = document.getElementById("btn-skin");
    if (btnSkin) btnSkin.hidden = true;
    const winPanel = document.getElementById("win-panel");
    if (winPanel) winPanel.hidden = false;
    const winTime = document.getElementById("win-time");
    if (winTime) winTime.textContent = `Tempo: ${formatTimeMs(ms)}`;
    const status = document.getElementById("score-status");
    if (status) status.textContent = "";
    this.refreshLeaderboardUI();
    this.overlay.hidden = false;
    // Libera teclado do jogo e foca o nome (Input ignora campos de texto)
    queueMicrotask(() => {
      const nameInput = document.getElementById("player-name");
      nameInput?.focus({ preventScroll: true });
      nameInput?.select?.();
    });
  }

  async refreshLeaderboardUI() {
    const winList = document.getElementById("leaderboard-list");
    const rankList = document.getElementById("rank-overlay-list");
    const seasonLabel = document.getElementById("rank-season-label");
    if (winList) winList.innerHTML = "<li>Carregando…</li>";
    if (rankList) rankList.innerHTML = "<li>Carregando…</li>";
    const data = await fetchLeaderboard(10);
    this.leaderboard = data.entries || [];
    this.leaderboardSeason = data.season || data.currentSeason;
    if (seasonLabel) {
      seasonLabel.textContent = this.leaderboardSeason
        ? `Temporada ${this.leaderboardSeason} · tecla T`
        : "Ranking compartilhado · tecla T";
    }
    this.fillLeaderboardList(winList, this.leaderboard);
    this.fillLeaderboardList(rankList, this.leaderboard);
    this.fillAchievementsList();
  }

  fillAchievementsList() {
    const ul = document.getElementById("achievements-list");
    if (!ul) return;
    const items = listAchievements();
    ul.innerHTML = items
      .map(
        (a) =>
          `<li>${a.unlocked ? "✓" : "○"} <strong>${a.title}</strong> — ${a.desc}</li>`
      )
      .join("");
  }

  async submitWinScore() {
    const input = document.getElementById("player-name");
    const status = document.getElementById("score-status");
    const btn = document.getElementById("btn-submit-score");
    const name = (input?.value || "").trim() || "Sobrevivente";
    try {
      localStorage.setItem("nevePlayerName", name.slice(0, 16));
    } catch {
      /* ignore */
    }
    const ms = this.speedrun.finalMs ?? this.speedrun.ms;
    if (btn) btn.disabled = true;
    if (status) {
      status.textContent = "Enviando ao ranking online…";
      status.classList.remove("win-panel__status--ok", "win-panel__status--warn", "win-panel__status--err");
    }
    try {
      const data = await submitScore(name, ms, {
        daily: isDailyMode(),
        hardcore: !!this.difficulty?.hardcore,
      });
      this.leaderboard = data.entries || [];
      this.fillLeaderboardList(document.getElementById("leaderboard-list"), this.leaderboard);
      this.fillLeaderboardList(document.getElementById("rank-overlay-list"), this.leaderboard);
      const top = getTopEntry(this.leaderboard);
      if (top) this.speedrun.setRecord(top);

      if (data.localOnly) {
        // Não celebra como compartilhado — permite reenviar
        if (status) {
          status.textContent = `Ranking online indisponível (#${data.rank} só neste navegador). Verifique a rede e toque em Enviar de novo.`;
          status.classList.add("win-panel__status--warn");
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Tentar de novo";
        }
        return;
      }

      if (status) {
        status.textContent = `No ranking online! Posição #${data.rank} — todos os jogadores veem seu tempo (tecla T).`;
        status.classList.add("win-panel__status--ok");
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Enviado";
      }
    } catch (err) {
      if (status) {
        status.textContent = err.message || "Falha ao enviar.";
        status.classList.add("win-panel__status--err");
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar tempo";
      }
    }
  }

  respawn() {
    const s = CONFIG.survival;
    this.health = s.maxHealth;
    this.warmth = s.maxWarmth;
    this.ended = false;
    this.player.reset(this.world.getSpawn());
    this.hud.setHealth(this.health, s.maxHealth);
    this.hud.setWarmth(this.warmth, s.maxWarmth);
    this.state = "playing";
    this.overlay.hidden = true;
    this.requestPointerLock();
  }

  buildPostFX() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom full-screen é caro; desktop usa versão leve (threshold alto)
    const wantBloom = this.lowFx ? CONFIG.mobileGfx?.bloom === true : true;
    if (wantBloom) {
      this.bloomPass = new UnrealBloomPass(size, 0.22, 0.35, 0.92);
      this.composer.addPass(this.bloomPass);
    } else {
      this.bloomPass = null;
    }

    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(new OutputPass());
  }

  buildSky() {
    // cúpula com gradiente (zenite mais escuro/azul, horizonte mais claro)
    const skyGeo = new THREE.SphereGeometry(420, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4a90d9) },
        bottomColor: { value: new THREE.Color(0xc8dff5) },
        offset: { value: 0.1 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.skyDome);

    // sol e lua bem claros — o bloom pega nesses pixels
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(12, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false })
    );
    this.scene.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false })
    );
    this.scene.add(this.moonMesh);

    // cúpula de estrelas (só aparece à noite)
    const starCount = this.lowFx ? 220 : 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // direção aleatória no hemisfério superior
      const theta = Math.random() * Math.PI * 2;
      const y = 0.06 + Math.random() * 0.94;
      const r = Math.sqrt(1 - y * y);
      const R = 340;
      positions.set([Math.cos(theta) * r * R, y * R, Math.sin(theta) * r * R], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.scene.add(this.stars);

    this._skyDay = new THREE.Color(CONFIG.colors.skyDay);
    this._skyNight = new THREE.Color(CONFIG.colors.skyNight);
    this._skyDusk = new THREE.Color(CONFIG.colors.skyDusk);
    this._skyTmp = new THREE.Color();
    this._skyTop = new THREE.Color();
    this._skyBottom = new THREE.Color();
  }

  getSeason() {
    const list = CONFIG.world.seasons || [];
    if (!list.length) {
      return {
        id: "winter",
        label: "Inverno",
        icon: "❄️",
        warmthMul: 1,
        snowMul: 1,
        iceOpacity: 0.96,
      };
    }
    const i = ((this.seasonIndex % list.length) + list.length) % list.length;
    return list[i];
  }

  /** Avança estação a cada `seasonDays` midnights. */
  tickSeasonOnDayWrap() {
    if (this.dayTime >= this._prevDayTime) {
      this._prevDayTime = this.dayTime;
      return;
    }
    // dayTime wrap = meia-noite
    this._prevDayTime = this.dayTime;
    const need = CONFIG.world.seasonDays || 2;
    this.seasonDayAcc = (this.seasonDayAcc || 0) + 1;
    if (this.seasonDayAcc < need) return;
    this.seasonDayAcc = 0;
    const n = CONFIG.world.seasons?.length || 4;
    this.seasonIndex = ((this.seasonIndex || 0) + 1) % n;
    const s = this.getSeason();
    this.world.applySeason?.(s);
    this.hud.showMsg(`${s.icon} Chegou ${s.label}`, 3800);
  }

  // Ciclo de dia e noite: move sol/lua, mistura cores do céu e da névoa,
  // acende estrelas/vagalumes. Retorna o fator de noite (0..1).
  updateDayNight(dt) {
    this.dayTime = (this.dayTime + dt / CONFIG.world.dayLength) % 1;
    this.tickSeasonOnDayWrap();
    const season = this.getSeason();

    // Dungeon secreta: ambiente fixo escuro (fog curto esconde o mundo lá fora).
    // O caminho normal recalcula tudo por frame, então ao sair restaura sozinho.
    if (this.dungeon?.active) {
      this.scene.background.set(0x05060a);
      this.scene.fog.color.set(0x05060a);
      this.scene.fog.near = 5;
      this.scene.fog.far = 46;
      this.hemi.intensity = 0.1;
      this.ambient.intensity = 0.12;
      this.sunLight.intensity = 0;
      this.moonLight.intensity = 0;
      this.starMat.opacity = 0;
      this.renderer.toneMappingExposure = 0.85;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.5;
        this.bloomPass.threshold = 0.6;
      }
      if (this.vignettePass) this.vignettePass.uniforms.darkness.value = 0.72;
      this.hud.updateTime(this.dayTime, 1, season);
      return 1;
    }
    const t = this.dayTime * Math.PI * 2;
    const elev = Math.sin(t); // >0 dia, <0 noite

    const dayF = THREE.MathUtils.smoothstep(elev, -0.08, 0.25); // 0 noite, 1 dia
    const duskF = Math.max(0, 1 - Math.abs(elev) / 0.3); // perto do horizonte
    this.duskF = duskF;

    // direção do sol (a lua fica no lado oposto)
    // a área de sombra acompanha o jogador para manter nitidez
    const sunDir = this._tmpSunDir.set(Math.cos(t), Math.sin(t), 0.35).normalize();
    const anchor = this.player.position;
    this.sunLight.position.copy(anchor).addScaledVector(sunDir, 150);
    this.sunLight.target.position.copy(anchor);
    this.sunLight.intensity = Math.max(0, elev) * 0.95;
    this.sunLight.color.setHex(0xfff2d6).lerp(this._tmpColorA.setHex(0xff8844), duskF);
    this.moonLight.position.copy(sunDir).multiplyScalar(-150);
    this.moonLight.intensity = Math.max(0, -elev) * 0.22;

    // sol, lua e cúpula sempre centrados no jogador
    const eye = this.camera.position;
    this.skyDome.position.copy(eye);
    this.sunMesh.position.copy(eye).addScaledVector(sunDir, 320);
    this.moonMesh.position.copy(eye).addScaledVector(sunDir, -320);
    this.stars.position.copy(eye);

    // céu: noite -> dia, com laranja no nascer/pôr do sol
    this._skyTmp.copy(this._skyNight).lerp(this._skyDay, dayF);
    this._skyTmp.lerp(this._skyDusk, duskF * 0.55);
    this.scene.background.copy(this._skyTmp);
    this.scene.fog.color.copy(this._skyTmp);

    // gradiente da cúpula: zenite vs horizonte
    this._skyTop.copy(this._skyNight).lerp(this._tmpColorA.setHex(0x6d9cc4), dayF);
    this._skyTop.lerp(this._skyDusk, duskF * 0.35);
    this._skyBottom.copy(this._skyNight).lerp(this._tmpColorA.setHex(0xe8f0f7), dayF);
    this._skyBottom.lerp(this._tmpColorA.setHex(0xffb070), duskF * 0.7);
    this.skyMat.uniforms.topColor.value.copy(this._skyTop);
    this.skyMat.uniforms.bottomColor.value.copy(this._skyBottom);

    // luzes gerais acompanham o dia
    this.hemi.intensity = 0.22 + dayF * 0.7;
    this.hemi.color.setHex(0xdceaff).lerp(this._tmpColorA.setHex(0xffc090), duskF * 0.5);
    this.ambient.intensity = 0.12 + dayF * 0.28;
    this.starMat.opacity = THREE.MathUtils.clamp(-elev * 2.2, 0, 1);
    this.renderer.toneMappingExposure = 0.85 + dayF * 0.4;

    const night = 1 - dayF;
    // de noite o bloom sobe um pouco (vagalumes/lua); de dia fica sutil no sol
    const aurora = this.world?.auroraIntensity || 0;
    if (this.bloomPass) {
      this.bloomPass.strength = 0.28 + night * 0.45 + aurora * 0.55;
      this.bloomPass.threshold = 0.82 - night * 0.2 - aurora * 0.15;
    }
    if (this.vignettePass) {
      const aimExtra =
        this.player?.aiming && this.state === "playing"
          ? CONFIG.camera?.aimVignetteExtra ?? 0.22
          : 0;
      const winterFog = season?.id === "winter" ? 0.08 : 0;
      this.vignettePass.uniforms.darkness.value =
        0.4 + night * 0.25 - aurora * 0.12 + aimExtra + winterFog;
    }
    if (this.scene.fog && this._baseFogNear != null) {
      const mul = season?.fogDensityMul ?? 1;
      this.scene.fog.near = this._baseFogNear / mul;
      this.scene.fog.far = this._baseFogFar / Math.sqrt(mul);
    }
    // névoa ganha tom verde-azulado sob a aurora
    if (aurora > 0.05) {
      this.scene.fog.color.lerp(this._tmpColorA.setHex(0x1a3a38), aurora * 0.35);
      this.hemi.color.lerp(this._tmpColorB.setHex(0x88ffcc), aurora * 0.4);
      this.hemi.intensity = Math.max(this.hemi.intensity, 0.22 + aurora * 0.35);
    }
    // tinta leve da estação na névoa / hemi
    if (season?.fogTint != null) {
      this.scene.fog.color.lerp(this._tmpColorA.setHex(season.fogTint), 0.18);
      this.hemi.color.lerp(this._tmpColorB.setHex(season.fogTint), 0.12);
    }

    this.hud.updateTime(this.dayTime, night, season);
    return night;
  }

  openReleaseNotes() {
    if (this.state === "won" || this.state === "dead" || this.state === "splash" || this.state === "skin") {
      return;
    }
    if (this.helpOpen) this.closeHelp(true);
    if (this.rankOpen) this.closeRank(true);
    const el = document.getElementById("release-overlay");
    if (!el) return;
    if (this.state === "playing") {
      this._releaseFromPlaying = true;
      this.state = "paused";
      this.speedrun.pause();
      if (!this.input.mobile) document.exitPointerLock();
      this.input.clearKeys();
      if (this.clickHint) this.clickHint.hidden = true;
      this.overlay.hidden = true;
    } else if (this.state === "paused") {
      this._releaseFromPlaying = false;
      this.overlay.hidden = true;
    }
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.releaseOpen = true;
  }

  /** @param {boolean} silent se true, não resume o jogo */
  closeReleaseNotes(silent = false) {
    const el = document.getElementById("release-overlay");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
    const wasFromPlaying = this._releaseFromPlaying;
    this.releaseOpen = false;
    this._releaseFromPlaying = false;
    if (silent) return;
    if (wasFromPlaying) {
      this.resume();
    } else if (this.state === "paused") {
      this.overlay.hidden = false;
    }
  }

  toggleReleaseNotes() {
    if (this.releaseOpen) this.closeReleaseNotes();
    else this.openReleaseNotes();
  }

  openHelp() {
    if (this.state === "won" || this.state === "dead" || this.state === "splash" || this.state === "skin") {
      return;
    }
    if (this.releaseOpen) this.closeReleaseNotes(true);
    if (this.rankOpen) this.closeRank(true);
    const el = document.getElementById("help-overlay");
    if (!el) return;
    if (this.state === "playing") {
      this._helpFromPlaying = true;
      this.state = "paused";
      this.speedrun.pause();
      if (!this.input.mobile) document.exitPointerLock();
      this.input.clearKeys();
      if (this.clickHint) this.clickHint.hidden = true;
      this.overlay.hidden = true;
    } else if (this.state === "paused") {
      this._helpFromPlaying = false;
      this.overlay.hidden = true;
    }
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.helpOpen = true;
  }

  /** @param {boolean} silent se true, não resume o jogo (ex.: ao morrer) */
  closeHelp(silent = false) {
    const el = document.getElementById("help-overlay");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
    const wasFromPlaying = this._helpFromPlaying;
    this.helpOpen = false;
    this._helpFromPlaying = false;
    if (silent) return;
    if (wasFromPlaying) {
      this.resume();
    } else if (this.state === "paused") {
      this.overlay.hidden = false;
    }
  }

  toggleHelp() {
    if (this.helpOpen) this.closeHelp();
    else this.openHelp();
  }

  openRank() {
    if (this.state === "splash" || this.state === "skin") return;
    if (this.releaseOpen) this.closeReleaseNotes(true);
    if (this.helpOpen) this.closeHelp(true);
    const el = document.getElementById("rank-overlay");
    if (!el) return;
    if (this.state === "playing") {
      this._rankFromPlaying = true;
      this.state = "paused";
      this.speedrun.pause();
      if (!this.input.mobile) document.exitPointerLock();
      this.input.clearKeys();
      if (this.clickHint) this.clickHint.hidden = true;
      this.overlay.hidden = true;
    } else if (this.state === "paused" || this.state === "won" || this.state === "dead") {
      this._rankFromPlaying = false;
      if (this.state === "paused") this.overlay.hidden = true;
    }
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.rankOpen = true;
    this.refreshLeaderboardUI();
  }

  /** @param {boolean} silent se true, não resume / não reexibe pause */
  closeRank(silent = false) {
    const el = document.getElementById("rank-overlay");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
    const wasFromPlaying = this._rankFromPlaying;
    this.rankOpen = false;
    this._rankFromPlaying = false;
    if (silent) return;
    if (wasFromPlaying) {
      this.resume();
    } else if (this.state === "paused") {
      this.overlay.hidden = false;
    }
  }

  toggleRank() {
    if (this.rankOpen) this.closeRank();
    else this.openRank();
  }

  fillLeaderboardList(listEl, entries) {
    if (!listEl) return;
    if (!entries.length) {
      listEl.innerHTML = "<li>Nenhum tempo ainda — seja o primeiro.</li>";
      return;
    }
    listEl.innerHTML = entries
      .map(
        (e, i) =>
          `<li><span>${i + 1}. ${e.name}</span><span>${formatTimeMs(e.timeMs)}</span></li>`
      )
      .join("");
  }

  bindUI() {
    this.hud.onVerSkin = () => this.toggleVerSkinView();
    document.getElementById("btn-coop-reconnect-now")?.addEventListener("click", () => {
      void this.reconnectCoopInPlace();
    });
    document.getElementById("btn-coop-reconnect-dismiss")?.addEventListener("click", () => {
      this.hideCoopReconnect();
      if (this.state === "paused") this.overlay.hidden = false;
    });
    document.getElementById("btn-resume").addEventListener("click", () => this.resume());
    document.getElementById("btn-restart").addEventListener("click", () => this.restart());
    document.getElementById("btn-skin")?.addEventListener("click", () => this.openSkinPickerFromPause());
    document.getElementById("btn-pet-toggle")?.addEventListener("click", () => this.togglePet());
    this.refreshPetButton();
    document.getElementById("btn-submit-score")?.addEventListener("click", () => this.submitWinScore());
    document.getElementById("btn-help-close")?.addEventListener("click", () => this.closeHelp());
    document.getElementById("btn-release-close")?.addEventListener("click", () => this.closeReleaseNotes());
    document.getElementById("btn-rank-close")?.addEventListener("click", () => this.closeRank());
    document.getElementById("btn-rank-pause")?.addEventListener("click", () => this.openRank());
    document.getElementById("btn-rank-export")?.addEventListener("click", () => {
      exportLeaderboardJson(this.leaderboard || [], {
        season: this.leaderboardSeason || "current",
      });
    });
    document.getElementById("btn-release-notes")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleReleaseNotes();
    });
    document.getElementById("btn-release-pause")?.addEventListener("click", () => this.openReleaseNotes());
    document.getElementById("btn-release-touch")?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.openReleaseNotes();
      },
      { passive: false }
    );
    document.getElementById("btn-help-hud")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleHelp();
    });
    document.getElementById("btn-help-pause")?.addEventListener("click", () => this.openHelp());
    document.getElementById("btn-help")?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.toggleHelp();
      },
      { passive: false }
    );
    window.addEventListener("neve-user-gesture", () => this.ambience.unlockFromGesture(), {
      once: true,
    });
    document.getElementById("skin-confirm")?.addEventListener(
      "pointerdown",
      () => this.ambience.unlockFromGesture(),
      { once: true }
    );

    document.addEventListener("keydown", (e) => {
      // Desktop: nunca roubar teclas enquanto o foco está num input (código co-op / nome / chat)
      if (Input.isTypingTarget(e.target) || Input.isTypingNow()) return;
      if (this.chat?.open) return;
      // Y / Enter — chat estilo CS (U fica no look IJKL)
      if (
        (e.code === "KeyY" || e.code === "Enter" || e.code === "NumpadEnter") &&
        this.state === "playing" &&
        !this.helpOpen &&
        !this.rankOpen &&
        !this.releaseOpen
      ) {
        e.preventDefault();
        this.chat?.begin("say");
        return;
      }
      if (e.code === "KeyT") {
        if (
          this.state === "playing" ||
          this.state === "paused" ||
          this.state === "won" ||
          this.state === "dead" ||
          this.rankOpen
        ) {
          e.preventDefault();
          this.toggleRank();
        }
        return;
      }
      if (e.code === "KeyH") {
        if (this.state === "playing" || this.state === "paused" || this.helpOpen) {
          e.preventDefault();
          this.toggleHelp();
        }
        return;
      }
      if (e.code === "Escape") {
        if (this.releaseOpen) {
          e.preventDefault();
          this.closeReleaseNotes();
          return;
        }
        if (this.rankOpen) {
          e.preventDefault();
          this.closeRank();
          return;
        }
        if (this.helpOpen) {
          e.preventDefault();
          this.closeHelp();
          return;
        }
        if (this.state === "playing" && this.demoMode) {
          e.preventDefault();
          this.cancelDemo();
          this.pause();
          return;
        }
        if (this.state === "playing" && this.tutorial?.active) {
          e.preventDefault();
          this.tutorial.skip();
          return;
        }
        if (this.state === "playing") {
          e.preventDefault();
          this.pause();
        } else if (this.state === "paused") {
          e.preventDefault();
          this.resume();
        }
      }
    });

    const unlock = () => {
      if (
        this.state === "playing" &&
        !this.demoMode &&
        !this.helpOpen &&
        !this.rankOpen &&
        !this.releaseOpen &&
        !this.chat?.open
      ) {
        this.requestPointerLock();
        this.speedrun.start();
      }
    };
    this.canvas.addEventListener("click", unlock);
    // Android Chrome: resume() TEM que rodar na stack do gesto (sem await).
    const audioUnlock = () => this.ambience.unlockFromGesture();
    window.addEventListener("pointerdown", audioUnlock, { capture: true, passive: true });
    window.addEventListener("touchstart", audioUnlock, { capture: true, passive: true });
    window.addEventListener("touchend", audioUnlock, { capture: true, passive: true });
    window.addEventListener("keydown", audioUnlock, { capture: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.ambience.resumeIfSuspended();
    });
    window.addEventListener(
      "touchstart",
      () => {
        this.ambience.unlockFromGesture();
        if (this.input.mobile) this.input.locked = true;
        this.speedrun.start();
      },
      { once: true, passive: true }
    );

    // Botão explícito no mobile — volume de mídia às vezes está baixo / contexto suspenso
    const soundBtn = document.getElementById("btn-enable-sound");
    if (soundBtn) {
      const arm = () => {
        this.ambience.unlockFromGesture();
        this.refreshSoundButton();
      };
      soundBtn.addEventListener("pointerdown", arm);
      soundBtn.addEventListener("click", arm);
    }
  }

  refreshSoundButton() {
    const soundBtn = document.getElementById("btn-enable-sound");
    if (!soundBtn) return;
    const need =
      !!this.input?.mobile && !(this.ambience?.started && this.ambience?.contextRunning);
    soundBtn.hidden = !need;
    soundBtn.setAttribute("aria-hidden", need ? "false" : "true");
  }

  requestPointerLock() {
    this.ambience.unlockFromGesture(); // gesto do usuário: áudio + trilha
    // Durante o tutorial o mouse fica livre para clicar em “Pular”
    if (this.tutorial?.active) {
      try {
        document.exitPointerLock?.();
      } catch {
        /* ignore */
      }
      if (this.clickHint) {
        this.clickHint.hidden = false;
        this.clickHint.textContent = "Tutorial: Esc/P ou botão Pular · depois clique para mirar";
      }
      return;
    }
    if (this.input.mobile) {
      this.input.locked = true;
      return;
    }
    if (document.pointerLockElement === this.canvas) return;
    // Chrome: SecurityError se pedir lock logo após Esc / exitPointerLock
    const unlockedAt = this.input?.unlockedAt || 0;
    if (unlockedAt && performance.now() - unlockedAt < 900) {
      if (this.clickHint) {
        this.clickHint.hidden = false;
        this.clickHint.textContent = "Clique na tela para mirar de novo";
      }
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.canvas.focus({ preventScroll: true });
    let req;
    try {
      req = this.canvas.requestPointerLock?.();
    } catch {
      if (this.clickHint) this.clickHint.hidden = false;
      return;
    }
    // API moderna devolve Promise — rejeição não tratada poluía o console
    if (req && typeof req.then === "function") {
      req.catch(() => {
        if (this.clickHint) {
          this.clickHint.hidden = false;
          this.clickHint.textContent = "Clique na tela para mirar";
        }
      });
    }
  }

  setCameraMode(mode) {
    const prev = this.cameraMode;
    this.cameraMode = mode === "third" ? "third" : "first";
    this.player.setCameraMode(this.cameraMode);
    this.hud.updateCameraMode(this.cameraMode, {
      facingFront: this.player.isOrbitFront(),
    });
    if (
      this.state === "playing" &&
      this.cameraMode === "third" &&
      prev !== "third"
    ) {
      this.maybeShowOrbitHint();
    }
  }

  maybeShowOrbitHint() {
    if (this._orbitHintShown || this.cameraMode !== "third") return;
    this._orbitHintShown = true;
    this.hud.showMsg(
      "Alt + setas (ou botão Ver skin) para girar e ver seu personagem",
      5000
    );
  }

  toggleVerSkinView() {
    if (this.cameraMode !== "third") this.setCameraMode("third");
    this.player.toggleOrbitFrontView();
    this.hud.updateVerSkinLabel(this.player.isOrbitFront());
  }

  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === "first" ? "third" : "first");
  }

  start() {
    this.setCameraMode(this.cameraMode);
    this.overlay.hidden = true;
    this.hud.show();
    this.hud.setInventoryVisible(true);
    this.refreshInventoryUI();
    this.state = "playing";
    if (this.input.mobile) this.setTouchUiVisible(true);
    this.maybeShowOrbitHint();
    this.input.attach();
    // Cronômetro começa ao entrar na partida (Novo jogo / Continuar), sem exigir clique no canvas
    if (this.speedrun.started) this.speedrun.resume();
    else this.speedrun.start();
    this.ensureLoop();
  }

  pause() {
    if (this.state !== "playing") return;
    this.chat?.close(false);
    this.cancelWeaponCharge();
    this.state = "paused";
    this.speedrun.pause();
    this.persistSave();
    if (!this.input.mobile) document.exitPointerLock();
    this.input.clearKeys();
    this._wasLeftHeld = false;
    if (this.clickHint) this.clickHint.hidden = true;
    const winPanel = document.getElementById("win-panel");
    if (winPanel) winPanel.hidden = true;
    this.overlayTitle.textContent = "Pausado";
    this.overlayMsg.textContent = this.input.mobile
      ? "Progresso salvo · Continuar · Ranking · ? = ajuda."
      : "Progresso salvo. Continuar · Ranking (T) · Ajuda (H) · Reiniciar apaga o save.";
    document.getElementById("btn-resume").textContent = "Continuar";
    document.getElementById("btn-resume").hidden = false;
    const btnSkin = document.getElementById("btn-skin");
    if (btnSkin) btnSkin.hidden = false;
    this.refreshPetButton();
    this.overlay.hidden = false;
  }

  resume() {
    if (this.helpOpen) this.closeHelp(true);
    if (this.releaseOpen) this.closeReleaseNotes(true);
    if (this.rankOpen) this.closeRank(true);
    if (this.state === "dead") {
      this.respawn();
      return;
    }
    if (this.state !== "paused") return;
    this.state = "playing";
    this.speedrun.resume();
    this.overlay.hidden = true;
    this.hud.setInventoryVisible(true);
    this.refreshInventoryUI();
    this.requestPointerLock();
  }

  restart() {
    clearMidRunSave();
    location.reload();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const maxDpr = this.lowFx ? CONFIG.mobileGfx?.maxDpr ?? 1 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  update(dt) {
    if (this.state === "cutscene" || isCinematicActive()) {
      updateCinematic(dt);
      if (this.ambience?.started) {
        this.ambience.updateMusic(dt, {
          bearChasing: false,
          bearDist: 999,
          lowHealth: false,
        });
      }
      this.input.endFrame();
      return;
    }

    if (this.state !== "playing") {
      // Trilha continua nos menus (skin/dificuldade/co-op) após o gesto
      if (this.ambience?.started) {
        this.ambience.updateMusic(dt, {
          bearChasing: false,
          bearDist: 999,
          lowHealth: false,
        });
      }
      this.input.endFrame();
      return;
    }

    if (this.clickHint) {
      this.clickHint.hidden = this.input.locked || this.input.mobile;
      if (this.input.mobile) {
        this.clickHint.textContent = "Toque na tela para começar (áudio + trilha)";
        // started pode ser true com o contexto ainda suspenso — só
        // esconde o aviso quando o som está saindo de verdade
        this.clickHint.hidden = this.ambience.started && this.ambience.contextRunning;
      }
      this.refreshSoundButton();
    }

    // Esc no desktop: bindUI. Tap pause no celular: toggle pausa/continuar
    if (this.input._tapEsc) {
      this.input._tapEsc = false;
      if (this.demoMode) {
        this.cancelDemo();
        this.pause();
      } else if (this.tutorial?.active) this.tutorial.skip();
      else if (this.state === "paused") this.resume();
      else this.pause();
    }

    // Demo automática: sintetiza input (após checar Esc do usuário)
    if (this.demoMode && this.demoBot) {
      if (this.input.pausePressed) {
        this.cancelDemo();
        this.pause();
        this.input.endFrame();
        return;
      }
      this.demoBot.drive(this.input, dt);
      this.refreshDemoBanner();
      // espectador não usa touch UI
      this.setTouchUiVisible(false);
    }

    this._saveAcc = (this._saveAcc || 0) + dt;
    if (!this.demoMode && this._saveAcc >= 25) {
      this._saveAcc = 0;
      // JSON no localStorage no meio do frame engasga — adianta para o próximo tick
      setTimeout(() => this.persistSave(), 0);
    }

    if (this.input.wasPressed("KeyR")) {
      this.cancelWeaponCharge();
      const r = this.weapons.reload();
      if (r.msg) this.hud.showMsg(r.msg, 2200);
      if (r.ok) this.ambience.reload?.(this.weapons.current);
      this.refreshInventoryUI();
    }
    if (this.input.wasPressed("KeyC")) {
      this.tryCraftFence();
    }

    this.speedrun.update(dt);
    this.hud.setTimer(this.speedrun.format());
    this.updateGhostHud();

    const slot = this.input.consumeNumberKey();
    if (slot >= 1 && slot <= 10) {
      const order = this.weapons.slots();
      const pick = order[slot - 1];
      if (pick) {
        if (!this.hud.isInventoryVisible()) this.hud.setInventoryVisible(true);
        this.equipWeapon(pick.id);
        this.tutorial?.notify("equip");
      }
    }
    if (this.input.wasPressed("KeyB") || this.input._tapInv) {
      this.input._tapInv = false;
      const open = this.hud.toggleInventoryExpanded();
      // evita tecla B presa (pointer lock / keyup perdido)
      this.input.releaseKeys("KeyB");
      if (this.input.mobile) {
        this.hud.showMsg(open ? "Armas — toque ✕ para fechar" : "Armas escondidas — ⋯ → 🎒", 1600);
      } else {
        this.hud.showMsg(open ? "Armas abertas — B ou ✕ esconde" : "Armas escondidas — B mostra", 1600);
      }
      this.tutorial?.notify("inventory");
      // no desktop, solta o mouse um instante para clicar nos slots
      if (open && !this.input.mobile && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
    if (this.input._tapWeapon) {
      this.input._tapWeapon = false;
      this.cycleWeapon(1);
    }
    const wheel = this.input.consumeWheel();
    if (wheel) this.cycleWeapon(Math.sign(wheel));
    if (this.input.wasPressed("KeyG") || this.input._tapTrapCycle) {
      this.input._tapTrapCycle = false;
      this.cycleTrap();
    }
    if (this.input.wasPressed("KeyF") || this.input._tapTrapPlace) {
      this.input._tapTrapPlace = false;
      this.tryPlaceTrap();
    }
    this.tutorial?.update();

    const mouseDelta = this.input.consumeMouseDelta();
    const orbiting =
      this.cameraMode === "third" && this.input.orbitModifier;
    const aiming =
      !!this.input.rightDown &&
      !this.input.orbitModifier &&
      !this.input.mobile &&
      !this.chat?.open;
    const aimSens = aiming ? CONFIG.camera?.aimSensMul ?? 0.52 : 1;
    if (this.input.locked || this.input.mobile || this.input.rightDown) {
      if (orbiting) this.player.applyOrbitLook(mouseDelta);
      else this.player.applyLook(mouseDelta, aimSens);
    }
    if (orbiting) this.player.applyOrbitKeys(dt, this.input);
    else this.player.applyKeyboardLook(dt, this.input);
    if (this.cameraMode === "third") {
      this.hud.updateVerSkinLabel(this.player.isOrbitFront());
    }
    if (this.input.toggleCamera) {
      // Alt+V em 3ª pessoa: zera órbita (volta a ver as costas)
      if (orbiting && this.input.wasPressed("KeyV")) {
        this.player.resetOrbit();
        this.input._tapTab = false;
        this.hud.updateVerSkinLabel(false);
      } else {
        this.toggleCameraMode();
      }
    }

    this.input.blockAim = !!this.chat?.open;
    if (this.mounts?.riding) {
      // montado: a montaria anda com WASD; o player vira passageiro (câmera livre)
      this.mounts.updateRiding(dt, this.input, this.player);
      this.player.update(dt, this.mounts.stubInput(this.input));
    } else {
      this.player.update(dt, this.input);
    }
    this.hud.el?.classList.toggle("is-aiming", !!this.player.aiming);
    this.coop?.tick(dt);

    const night = this.updateDayNight(dt);
    this.world.update(dt, this.elapsed, night, this.duskF, this.player.position);
    this.dungeon?.update(dt, this);
    this.worldEvents?.update(dt, this, night);
    this.pet?.update(dt, this.player.position);
    if (this.pet?.justSniffed) {
      this.hud.showMsg("O husky farejou algo próximo…", 2200);
    }

    this.updateInteractions(dt);
    this.updateSurvival(dt, night);
    this.updateEnemyHud();
    // Minimapa Canvas2D todo frame + WebGL = hitch no Android
    const mapHz = this.lowFx ? CONFIG.mobileGfx?.minimapHz ?? 8 : 60;
    this._minimapAcc = (this._minimapAcc || 0) + dt;
    if (this._minimapAcc >= 1 / mapHz) {
      this._minimapAcc = 0;
      this.drawMinimap();
    }

    const moving = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 0.5;
    const threat = this.world.anyEnemyChasing(this.player.position);
    this.ambience.update(dt, {
      night,
      moving,
      sprint: this.input.sprint,
      onGround: this.player.onGround,
      onIce: this.world.isOnIce(this.player.position.x, this.player.position.z),
      fireDist: this.player.position.distanceTo(this.world.campfirePos),
      bearChasing: threat.chasing,
      bearDist: threat.dist,
      lowHealth: this.health < 35 && !this.ended,
    });

    this.input.endFrame();
  }

  updateInteractions(dt) {
    const p = this.player.position;
    const clicks = this.input.consumeClicks();

    // mensagem quando um item novo entra no alcance de descoberta
    const found = this.world.takeDiscovery();
    if (found) {
      this.hud.showMsg(`Algo brilha por perto... (${found.name})`);
      this.ambience.discover();
    }

    // dica de interação contextual
    // cristal da aurora: coleta automática ao chegar perto
    if (this.world.tryCollectAuroraGift(p)) {
      this.warmth = Math.min(CONFIG.survival.maxWarmth, this.warmth + 45);
      this.health = Math.min(CONFIG.survival.maxHealth, this.health + 15);
      this.hud.setWarmth(this.warmth, CONFIG.survival.maxWarmth);
      this.hud.setHealth(this.health, CONFIG.survival.maxHealth);
      this.ambience.auroraGift?.();
      this.hud.showMsg("✦ Cristal de gelo! Calor e vida restaurados.", 4200);
    }

    const item = this.world.nearestItem(p, 2.6);
    const chestDist = p.distanceTo(this.world.chestPos);
    const gift = this.world.auroraGift;
    const giftNear =
      gift?.visible && gift.userData.landed && p.distanceTo(gift.position) < 6;
    const useKey = this.input.mobile ? "◉" : "E";
    const caveNear = this.dungeon?.nearEntrance(p);
    // demo bot pulsa E para loot — não deixa ele domar/montar sem querer
    const mountNear = this.mounts?.riding || this.demoMode ? null : this.mounts?.nearest(p);
    if (this.mounts?.riding) {
      this.hud.setHint(`[${useKey}] Desmontar ${this.mounts.riding.label}`);
    } else if (caveNear) {
      this.hud.setHint(`[${useKey}] Entrar na caverna escura...`);
    } else if (item) {
      this.hud.setHint(`[${useKey}] Pegar ${item.name}`);
    } else if (mountNear) {
      const mLabel = mountNear.enemy.label;
      if (mountNear.kind === "tame") {
        this.hud.setHint(`[${useKey}] Domar ${mLabel} (já está calmo)`);
      }
      else if (mountNear.kind === "armor") this.hud.setHint(`[${useKey}] Equipar armadura em ${mLabel}`);
      else this.hud.setHint(`[${useKey}] Montar ${mLabel}`);
    } else if (chestDist < 3.2 && this.carried > 0) {
      this.hud.setHint(`[${useKey}] Depositar ${this.carried} ${this.carried === 1 ? "item" : "itens"} no baú`);
    } else if (giftNear) {
      this.hud.setHint("✦ Cristal de gelo por perto — aproxime-se");
    } else {
      this.hud.setHint(null);
    }

    if (this.input.interact) {
      if (this.mounts?.riding) {
        this.mounts.dismount(this.player);
        this.hud.showMsg("Você desmontou.", 1800);
      } else if (caveNear) {
        this.dungeon.tryEnter(this);
      } else if (item) {
        const kind =
          item.kind ||
          (item.weaponId ? "weapon" : item.ammoType ? "ammo" : item.trapId ? "trap" : "crate");
        this.world.collectItem(item);
        this.coop?.broadcastEvent("pickup", { saveId: item.saveId });
        const loot = this.weapons.onCollectItem(item);
        const gotTrap = this.traps.onCollectItem(item);
        const mat = this.craftBag?.onCollectItem?.(item);
        if (mat) {
          this.hud.showMsg(`Material: ${mat} · ${this.craftBag.statusLine()}`, 2200);
        }
        const healAmt =
          item.healthHeal ||
          (item.kind === "potion" || item.kind === "medkit" ? 35 : 0);
        let healed = 0;
        if (healAmt > 0) {
          const before = this.health;
          this.health = Math.min(CONFIG.survival.maxHealth, this.health + healAmt);
          healed = this.health - before;
          this.hud.setHealth(this.health, CONFIG.survival.maxHealth);
        }
        if (item.countsForWin !== false) this.carried++;
        this.ambience.pickupKind(kind === "weapon" || item.weaponId ? "weapon" : kind);
        this.hud.flashLoot();
        // sempre sincroniza mesh da arma equipada após loot
        this.player.setHeldWeapon(this.weapons.current.id);
        this.refreshInventoryUI();
        this.refreshTrapUI();
        this.tutorial?.notify("pickup");
        if (healed > 0) {
          this.hud.showMsg(`Poção: +${Math.round(healed)} vida (${Math.round(this.health)})`, 2800);
        } else if (loot.unlocked) {
          this.hud.toggleInventoryExpanded(true);
          if (this.cameraMode === "first") {
            this.setCameraMode("third");
            this.hud.showMsg(
              `Arma no inventário: ${this.weapons.current.name} (B) · V = 1ª/3ª pessoa`,
              4500
            );
          } else {
            this.hud.showMsg(
              `Arma no inventário: ${this.weapons.current.name} — teclas 1-9/0 ou clique (B)`,
              4000
            );
          }
        } else if (gotTrap) {
          this.hud.showMsg(
            this.input.mobile
              ? `+ armadilha: ${item.name} · fogueira → ⋯ Trap / ✚`
              : `+ armadilha: ${item.name} · perto da fogueira [G] tipo [F] colocar`,
            3200
          );
        } else if (loot.ammoGained > 0 || item.ammoType) {
          const at = CONFIG.ammoTypes[item.ammoType];
          const wName = loot.weaponId ? CONFIG.weapons[loot.weaponId]?.name : null;
          const unlockNote = wName ? ` · ${wName} liberado (veja B)` : "";
          this.hud.showMsg(
            `Munição: +${loot.ammoGained || item.ammoAmount} ${at?.name || "tiros"} (total ${this.weapons.ammo[item.ammoType]})${unlockNote}`,
            3200
          );
        } else if (item.countsForWin !== false) {
          this.hud.showMsg(
            this.input.mobile
              ? `Suprimento: ${item.name} — leve ao baú (◉) · ${this.carried} na mochila`
              : `Suprimento: ${item.name} — leve ao baú (E) · ${this.carried} na mochila`,
            3000
          );
        } else {
          this.hud.showMsg(`Você pegou: ${item.name}`);
        }
      } else if (mountNear) {
        const beast = mountNear.enemy;
        if (mountNear.kind === "tame") {
          this.mounts.tame(beast);
          this.tutorial?.notify("tame");
          this.hud.showMsg(`${beast.label} domado! Aperte ${useKey} de novo para montar.`, 4200);
          this.toastAchievement(unlockAchievement("tame_mount"));
        } else if (mountNear.kind === "armor") {
          this.mounts.equipArmor(beast);
          this.hud.showMsg(`Armadura equipada em ${beast.label} — dano recebido cai pela metade.`, 3800);
        } else if (this.mounts.mount(beast, this.player)) {
          this.tutorial?.notify("ride");
          this.hud.showMsg(
            this.input.mobile
              ? `Montado em ${beast.label} — joystick anda, ◉ desmonta.`
              : `Montado em ${beast.label} — WASD anda, Shift galopa, ${useKey} desmonta.`,
            4200
          );
        }
      } else if (chestDist < 3.2 && this.carried > 0) {
        this.deposited += this.carried;
        this.carried = 0;
        this.ambience.deposit();
        this.hud.flashLoot();
        this.world.spawnLootBurst?.(this.world.chestPos, 0xffd75a, 10);
        this.tutorial?.notify("deposit");
        this.persistSave();
        this.coop?.broadcastEvent("deposit", { deposited: this.deposited });
        this.hud.showMsg(
          `Baú: ${this.deposited} + craft ${this.baseCrafted || 0} = ${this.winProgress()}/${this.world.itemsTotal}`,
          3200
        );
        this.checkWin();
      }
      this.hud.setItems(this.carried, this.deposited, this.world.itemsTotal);
    }

    // ataque com arma equipada (melee, hitscan, projétil ou granada)
    const weapon = this.weapons.current;
    this.attackCd -= dt;
    const canAim = this.input.locked || this.input.mobile;
    const leftHeld = !!this.input.leftHeld;
    const leftReleased = this._wasLeftHeld && !leftHeld;
    this._wasLeftHeld = leftHeld;

    if (weapon.chargeable) {
      this.updateChargeWeapon(dt, weapon, p, canAim, leftHeld, leftReleased, clicks.left);
    } else {
      if (this._charging) this.cancelWeaponCharge();
      const wantFire = weapon.auto ? clicks.left || leftHeld : clicks.left;
      if (wantFire && canAim && this.attackCd <= 0) {
        this.fireWeapon(weapon, p);
        this.tutorial?.notify("attack");
      }
    }
  }

  /** Arco / besta: segurar carrega, soltar dispara. */
  updateChargeWeapon(dt, weapon, p, canAim, leftHeld, leftReleased, leftClicked) {
    const maxT = weapon.chargeMax || 0.9;
    const minT = weapon.chargeMin || 0.12;

    if (!canAim || this.attackCd > 0) {
      if (this._charging) this.cancelWeaponCharge();
      return;
    }

    if (leftHeld && this.weapons.canFire()) {
      if (!this._charging) {
        this._charging = true;
        this._weaponCharge = 0;
        this._chargeTickAcc = 0;
        this.ambience.bowDrawStart?.(weapon);
      }
      this._weaponCharge = Math.min(maxT, (this._weaponCharge || 0) + dt);
      const t01 = this._weaponCharge / maxT;
      this.hud.setCharge(t01);
      this._chargeTickAcc = (this._chargeTickAcc || 0) + dt;
      if (this._chargeTickAcc >= 0.16) {
        this._chargeTickAcc = 0;
        this.ambience.bowDrawTick?.(t01);
      }
    } else if (this._charging && (leftReleased || (!leftHeld && leftClicked))) {
      // soltou: dispara se tiver carga mínima; clique muito curto ainda dispara fraco se passou min
      const charge = this._weaponCharge || 0;
      this.cancelWeaponCharge();
      if (charge >= minT * 0.35) {
        this.fireWeapon(weapon, p, { charge: Math.max(charge, minT * 0.5) });
        this.tutorial?.notify("attack");
      }
    } else if (!leftHeld && this._charging) {
      this.cancelWeaponCharge();
    } else if (leftClicked && !this.weapons.canFire()) {
      // clique seco sem munição
      this.fireWeapon(weapon, p);
    }
  }

  fireWeapon(weapon, p, opts = {}) {
    // sem munição: clique seco
    if (weapon.ammoType && !this.weapons.canFire()) {
      this.attackCd = 0.35;
      const at = CONFIG.ammoTypes[weapon.ammoType];
      const needsReload = (weapon.magSize || 0) > 0;
      const reserve = this.weapons.ammo[weapon.ammoType] ?? 0;
      this.hud.showMsg(
        needsReload
          ? reserve > 0
            ? `Carregador vazio — R para recarregar (${reserve} na reserva)`
            : `Sem ${at?.name?.toLowerCase() || "munição"} — explore o mapa ou loot`
          : `Sem ${at?.name?.toLowerCase() || "munição"}!`,
        2400
      );
      this.ambience.dryFire?.(weapon);
      this.refreshInventoryUI();
      return;
    }

    this.attackCd = weapon.cooldown || CONFIG.player.attackCooldown;
    this.weapons.consumeAmmo();
    this.warnIfAmmoCritical(weapon);
    this.player.setHeldWeapon(weapon.id);
    this.player.playAttack(weapon.fire === "hitscan" || weapon.fire === "projectile" ? "ranged" : "melee");

    const chargeT = opts.charge;
    const maxT = weapon.chargeMax || 1;
    const t01 =
      weapon.chargeable && chargeT != null
        ? Math.max(0, Math.min(1, chargeT / maxT))
        : 1;
    const lerp = (a, b) => a + (b - a) * t01;
    const dmgMul = weapon.chargeable
      ? lerp(weapon.chargeDmgMin ?? 0.45, weapon.chargeDmgMax ?? 1.25)
      : 1;
    const speedMul = weapon.chargeable
      ? lerp(weapon.chargeSpeedMin ?? 0.55, weapon.chargeSpeedMax ?? 1.2)
      : 1;
    const rangeMul = weapon.chargeable
      ? lerp(weapon.chargeRangeMin ?? 0.55, weapon.chargeRangeMax ?? 1.15)
      : 1;

    const aimRange = (weapon.range || 80) * rangeMul;
    const aim = this.player.getAimFire(this.world, aimRange);
    const origin = aim.origin;
    const dir = aim.dir;

    const dmgScale = this.difficulty?.weapon ?? 1;
    const dmg = Math.max(1, Math.round(weapon.damage * dmgScale * dmgMul));

    if (weapon.fire === "hitscan") {
      const pellets = weapon.pellets || 1;
      let hitAny = false;
      for (let i = 0; i < pellets; i++) {
        const d = dir.clone();
        const spread = weapon.spread || 0;
        if (spread > 0) {
          d.x += (Math.random() - 0.5) * spread * 2;
          d.y += (Math.random() - 0.5) * spread * 2;
          d.z += (Math.random() - 0.5) * spread * 2;
          d.normalize();
        }
        if (this.world.hitscan(origin, d, dmg, weapon.range)) hitAny = true;
      }
      this.ambience.weaponFire(weapon);
      if (hitAny) this.ambience.bearHit();
    } else if (weapon.fire === "projectile") {
      const speed = (weapon.projSpeed || 34) * speedMul;
      this.world.spawnProjectile({
        pos: origin.clone().addScaledVector(dir, 0.6),
        dir,
        speed,
        damage: dmg,
        kind: "arrow",
        ttl: 4 + t01 * 3,
      });
      this.ambience.weaponFire(weapon, 0.55 + t01 * 0.7);
    } else if (weapon.fire === "thrown") {
      const lob = dir.clone();
      lob.y += 0.35;
      lob.normalize();
      this.world.spawnProjectile({
        pos: origin.clone().addScaledVector(dir, 0.6),
        dir: lob,
        speed: weapon.projSpeed || 16,
        damage: dmg,
        kind: "grenade",
        fuse: 2.0,
        explodeRadius: weapon.explodeRadius || 6,
      });
      this.ambience.weaponFire(weapon);
    } else {
      // melee
      this.ambience.weaponFire(weapon);
      const hit = this.world.damageEnemyAt(p, dmg, weapon.range, {
        slowElite: weapon.slowElite || 0,
      });
      if (hit) {
        this.ambience.bearHit();
      }
    }
    if (weapon.ammoType) this.refreshInventoryUI();
  }

  /** Aviso curto quando a munição fica crítica (≤3 total). */
  warnIfAmmoCritical(weapon) {
    if (!weapon?.ammoType) return;
    if (!this.weapons.isAmmoCritical(weapon.id, 3)) return;
    const now = performance.now();
    if (now - (this._ammoWarnAt || 0) < 4500) return;
    this._ammoWarnAt = now;
    const at = CONFIG.ammoTypes[weapon.ammoType];
    const n = this.weapons.totalAmmoFor(weapon.id);
    this.hud.showMsg(
      n <= 1
        ? `Última ${at?.name?.toLowerCase() || "munição"}!`
        : `Poucas ${at?.name?.toLowerCase() || "balas"} (${n})`,
      2200
    );
  }

  updateSurvival(dt, night) {
    if (this.ended) return;
    const s = CONFIG.survival;
    const fireDist = this.player.position.distanceTo(this.world.campfirePos);

    if (fireDist < s.fireRadius) {
      this.warmth = Math.min(s.maxWarmth, this.warmth + s.warmthRegen * dt);
      if (this.warmth > 50) this.health = Math.min(s.maxHealth, this.health + s.fireHeal * dt);
      this._coldWarned = false;
      this._freezingWarned = false;
    } else {
      const coldMul = (this.difficulty?.cold ?? 1) * (this.worldEvents?.coldMul?.() ?? 1);
      const seasonMul = this.getSeason()?.warmthMul ?? 1;
      const drain =
        (night > 0.5 ? s.warmthDrainNight : s.warmthDrainDay) * coldMul * seasonMul;
      this.warmth = Math.max(0, this.warmth - drain * dt);

      // avisos claros — o frio não mata “do nada”
      if (this.warmth < 35 && !this._coldWarned) {
        this._coldWarned = true;
        this.hud.showMsg("Está esfriando... volte para a fogueira.");
      }

      if (this.warmth <= 0) {
        // dano de frio, mas NUNCA mata — só o urso pode matar
        const floor = s.coldMinHealth ?? 20;
        this.health = Math.max(floor, this.health - s.coldDamage * coldMul * dt);
        if (!this._freezingWarned) {
          this._freezingWarned = true;
          this.hud.showMsg("Você está congelando! Corra para a base.");
        }
      }
    }

    this.hud.setHealth(this.health, s.maxHealth);
    this.hud.setWarmth(this.warmth, s.maxWarmth);
  }

  updateEnemyHud() {
    const e = this.world.nearestHostile(this.player.position, 28);
    if (e) this.hud.setEnemy(e.label, e.hp, e.maxHp);
    else this.hud.setEnemy(null);
  }

  drawMinimap() {
    const ctx = this.hud.minimapCtx;
    if (!ctx || !this.world.minimapCanvas) return;
    const S = 180;
    const world = this.world;
    const p = this.player.position;
    const yaw = this.player.yaw;
    // raio visível em unidades do mundo (frente do player = cima do mapa)
    const viewRange = 72;
    const scale = S / 2 / viewRange;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    // mundo → tela: player no centro, yaw faz a frente apontar para cima
    const toScreen = (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return [S / 2 + (dx * cos - dz * sin) * scale, S / 2 + (dx * sin + dz * cos) * scale];
    };

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.clip();

    // terreno pré-renderizado, centrado e rotacionado com o olhar
    const srcS = world.minimapCanvas.width || S;
    const mapPx = srcS / world.size; // px do canvas-fonte por unidade mundo
    const imgScale = scale / mapPx;
    const ppx = ((p.x + world.half) / world.size) * srcS;
    const ppy = ((p.z + world.half) / world.size) * srcS;
    ctx.translate(S / 2, S / 2);
    ctx.rotate(yaw);
    ctx.scale(imgScale, imgScale);
    ctx.translate(-ppx, -ppy);
    ctx.drawImage(world.minimapCanvas, 0, 0);
    ctx.restore();

    const dot = (x, z, color, r = 3) => {
      const [mx, my] = toScreen(x, z);
      if (mx < -4 || my < -4 || mx > S + 4 || my > S + 4) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };

    dot(world.basePos.x, world.basePos.z, "#ffb03c", 4);

    for (const it of world.items) {
      if (it.collected || !it.discovered) continue;
      dot(it.pos.x, it.pos.z, "#5ce0ff", 3);
    }

    for (const e of world.enemies || []) {
      if (!e.alive) continue;
      if (e.mesh.position.distanceTo(p) > viewRange * 1.2) continue;
      const color = e.type === "wolf" ? "#c0c8d0" : e.type === "bear_elite" ? "#ff2020" : "#ff8040";
      dot(e.mesh.position.x, e.mesh.position.z, color, e.type === "bear_elite" ? 5 : 3);
    }

    // seta do jogador: sempre para cima (= direção do olhar)
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  loop(timestamp) {
    requestAnimationFrame((t) => this.loop(t));
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    const t0 = performance.now();
    this.update(dt);
    this.composer.render();
    // auto-degrade se o frame estourar (evita loop de freezes de vários segundos)
    const frameMs = performance.now() - t0;
    if (frameMs > 80) {
      this._slowFrames = (this._slowFrames || 0) + 1;
      if (this._slowFrames >= 3 && !this._perfDegraded) {
        this._perfDegraded = true;
        if (this.bloomPass) {
          this.bloomPass.enabled = false;
        }
        if (this.world?.snowData?.length > 280) {
          // esconde metade dos flocos (Buffer fica, mas update corta)
          this.world._snowPerfCap = 280;
        }
        this.hud?.showMsg?.("Modo leve ativado (PC lento detectado).", 3500);
      }
    } else {
      this._slowFrames = 0;
    }
  }
}

function showBootError(message) {
  const el = document.getElementById("boot-error");
  if (el) {
    el.hidden = false;
    el.textContent = message;
  }
}

function assertLocalRuntime() {
  if (location.protocol === "file:") {
    showBootError(
      "Abra via servidor local, nao pelo arquivo no disco. Na pasta web-cs rode: npm run start:win"
    );
    return false;
  }
  return true;
}

function assertWebGL() {
  const test = document.createElement("canvas");
  const gl = test.getContext("webgl") || test.getContext("experimental-webgl");
  if (!gl) {
    showBootError("WebGL nao disponivel neste navegador. Tente outro browser ou atualize os drivers de video.");
    return false;
  }
  return true;
}

if (assertLocalRuntime() && assertWebGL()) {
  try {
    window.__game = new Game();
  } catch (err) {
    console.error(err);
    showBootError(
      "Falha ao iniciar o jogo. Rode npm install && npm start na pasta web-cs e recarregue a pagina."
    );
  }
}
