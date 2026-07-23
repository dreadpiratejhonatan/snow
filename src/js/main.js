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
import { fetchLeaderboard, submitScore, formatTimeMs, getTopEntry } from "./leaderboard.js";
import { runSplash } from "./splash.js";
import { runSkinPicker, applySkinToPlayer, loadSkinId } from "./skins.js";
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
    this.weapons = new WeaponInventory();
    this.traps = new TrapInventory();
    this.tutorial = null;
    this.speedrun = new SpeedrunTimer();
    this.leaderboard = [];
    this.touch = null;
    this.state = "loading";
    this.cameraMode = "first";
    this.helpOpen = false;
    this._helpFromPlaying = false;
    this.rankOpen = false;
    this._rankFromPlaying = false;
    this.coop = null;
    this.coopRoom = null;
    this._saveAcc = 0;
    this.clock = new THREE.Clock();
    this.initThree();
    this.bindUI();
    window.addEventListener("beforeunload", () => this.persistSave());
    if (isTouchDevice()) {
      this.touch = new TouchControls(this.input);
      this.cameraMode = "third";
    }
    this.loadLeaderboardChallenge();
    // splash → depois inicia HUD / gameplay
    this.boot();
  }

  async boot() {
    this.state = "splash";
    this.hud.hide();
    this.setTouchUiVisible(false);
    await runSplash({ minMs: 3200, maxMs: 4800, fadeMs: 800 });
    this.state = "skin";
    // Sempre exige escolher um dos 5 personagens (rosto visível + preview girável)
    const skinId = await runSkinPicker({ force: true });
    applySkinToPlayer(this.player, skinId);
    // Começa em 3ª pessoa para ver o personagem; mouse gira a câmera
    if (!this.input.mobile) this.setCameraMode("third");

    const coopChoice = await this.promptCoopMenu();
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
      applyGameState(this, resumeSave);
      this.hud.showMsg("Expedição restaurada. Progresso auto-salva.", 4000);
    } else if (this.coop) {
      this.tutorial.skip();
    }
    this.start();
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
    if (!el) return Promise.resolve({ mode: "solo" });
    this.setTouchUiVisible(false);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    this.state = "coop";
    if (status) status.textContent = "No outro navegador: cole o código e Entrar.";
    if (joinBlock) joinBlock.hidden = false;
    if (codeInput) {
      codeInput.disabled = false;
      codeInput.readOnly = false;
      codeInput.value = "";
    }
    // Desktop: canvas com tabindex rouba foco — força o campo do código
    requestAnimationFrame(() => this.focusCoopCodeInput());

    return new Promise((resolve) => {
      const cleanup = () => {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        codeInput?.removeEventListener("keydown", onCodeKey);
        joinBlock?.removeEventListener("pointerdown", onJoinPointer);
        btnPaste?.removeEventListener("click", onPaste);
        btnSolo?.removeEventListener("click", onSolo);
        btnCreate?.removeEventListener("click", onCreate);
        btnJoin?.removeEventListener("click", onJoin);
      };
      const onSolo = () => {
        cleanup();
        resolve({ mode: "solo" });
      };
      const onCreate = async () => {
        btnCreate.disabled = true;
        btnSolo.disabled = true;
        btnJoin.disabled = true;
        btnPaste && (btnPaste.disabled = true);
        // Host não digita aqui — esconde join p/ não parecer que o campo “não aceita” teclado
        if (joinBlock) joinBlock.hidden = true;
        if (status) status.textContent = "Criando sala…";
        try {
          const room = new WebRtcRoom();
          room.onStatus = (m) => {
            if (status) status.textContent = m;
          };
          room.onCode = (code) => {
            if (codeBox) codeBox.hidden = false;
            if (codeDisplay) codeDisplay.textContent = code;
            if (status) {
              status.textContent = `Código ${code} — abra o site no outro PC/aba anônima, cole e Entre.`;
            }
          };
          const { code, seed } = await room.create(this.world.seed);
          await this.waitForRoomOpen(room);
          cleanup();
          resolve({ mode: "host", room, seed, code });
        } catch (err) {
          if (status) status.textContent = err.message || "Erro ao criar sala";
          btnCreate.disabled = false;
          btnSolo.disabled = false;
          btnJoin.disabled = false;
          if (btnPaste) btnPaste.disabled = false;
          if (joinBlock) joinBlock.hidden = false;
          this.focusCoopCodeInput();
        }
      };
      const onJoin = async () => {
        const code = (codeInput?.value || "").trim().toUpperCase();
        if (code.length < 4) {
          if (status) status.textContent = "Clique no campo e digite o código (ex: TBVKQ3).";
          this.focusCoopCodeInput();
          return;
        }
        btnCreate.disabled = true;
        btnSolo.disabled = true;
        btnJoin.disabled = true;
        if (btnPaste) btnPaste.disabled = true;
        if (codeInput) codeInput.disabled = true;
        if (status) status.textContent = "Entrando…";
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
          btnSolo.disabled = false;
          btnJoin.disabled = false;
          if (btnPaste) btnPaste.disabled = false;
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
          if (status) status.textContent = "Código colado — clique em Entrar na sala.";
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
        // Clique na área do código (não nos botões) foca o input — PC
        if (e.target?.closest?.("button")) return;
        if (e.target === codeInput) return;
        this.focusCoopCodeInput();
      };
      const btnSolo = document.getElementById("btn-coop-solo");
      const btnCreate = document.getElementById("btn-coop-create");
      const btnJoin = document.getElementById("btn-coop-join");
      const btnPaste = document.getElementById("btn-coop-paste");
      const codeBox = document.getElementById("coop-code-box");
      const codeDisplay = document.getElementById("coop-code-display");
      const btnCopy = document.getElementById("btn-coop-copy");
      if (codeBox) codeBox.hidden = true;
      btnCopy?.addEventListener("click", async () => {
        const code = codeDisplay?.textContent?.trim();
        if (!code || code.includes("—")) return;
        try {
          await navigator.clipboard.writeText(code);
          if (status) status.textContent = `Código ${code} copiado! Cole no outro PC (botão Colar).`;
        } catch {
          if (status) status.textContent = `Código: ${code} (selecione e Ctrl+C)`;
        }
      });
      codeInput?.addEventListener("keydown", onCodeKey);
      joinBlock?.addEventListener("pointerdown", onJoinPointer);
      btnPaste?.addEventListener("click", onPaste);
      btnSolo?.addEventListener("click", onSolo);
      btnCreate?.addEventListener("click", onCreate);
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
        reject(new Error("Tempo esgotado aguardando conexão P2P."));
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
        reject(new Error(`Conexão fechada (${why})`));
      };
    });
  }

  async beginCoop(choice) {
    const authority = choice.mode === "host";
    this.recreateWorld(choice.seed, authority);
    applySkinToPlayer(this.player, loadSkinId() || "natan");
    this.coopRoom = choice.room;
    this.coop = new CoopSession(this, choice.room);
    if (choice.room.isOpen) this.coop.onConnected();
    else {
      choice.room.onOpen = () => this.coop.onConnected();
    }
  }

  /** Recria mundo/player com seed (co-op guest/host alinhados). */
  recreateWorld(seed, authority = true) {
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

    this.world = new World(this.scene, { seed, authority });
    this.player = new Player(this.camera, this.scene, this.world, this.world.getSpawn());
    this.setCameraMode(this.cameraMode);
    this.initSurvival();
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
    if (this.state !== "playing" && this.state !== "paused") return;
    if (this.ended) return;
    writeMidRunSave(captureGameState(this));
  }

  async openSkinPickerFromPause() {
    if (this.state !== "paused") return;
    this.overlay.hidden = true;
    const skinId = await runSkinPicker({ force: true });
    applySkinToPlayer(this.player, skinId);
    this.hud.showMsg(`Skin: ${CONFIG.skins[skinId]?.name || skinId}`, 2200);
    this.overlay.hidden = false;
  }

  async loadLeaderboardChallenge() {
    const entries = await fetchLeaderboard(10);
    this.leaderboard = entries || [];
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
    } else {
      this.hud.setGhost({
        label: "Sem recorde ainda",
        countdown: "Seja o 1º!",
        urgent: false,
        failed: false,
      });
    }
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // sombras suaves + tone mapping cinematográfico
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.colors.skyDay);
    // névoa fria e fechada: sensação de nevasca no horizonte
    this.scene.fog = new THREE.Fog(CONFIG.colors.skyDay, 28, 110);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xdceaff, 0x9aa8b4, 0.9);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 0.8);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 400;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.moonLight = new THREE.DirectionalLight(0x8ea8d8, 0);
    this.scene.add(this.moonLight);

    this.buildSky();

    // relógio do mundo: 0 = nascer do sol, 0.25 = meio-dia, 0.5 = pôr do sol
    this.dayTime = 0.12;

    this.world = new World(this.scene);
    this.player = new Player(
      this.camera,
      this.scene,
      this.world,
      this.world.getSpawn()
    );

    this.initSurvival();
    this.buildPostFX();
    window.addEventListener("resize", () => this.onResize());
  }

  initSurvival() {
    const s = CONFIG.survival;
    this.health = s.maxHealth;
    this.warmth = s.maxWarmth;
    this.carried = 0;
    this.deposited = 0;
    this.attackCd = 0;
    this.ended = false;
    this._coldWarned = false;
    this._freezingWarned = false;

    this.world.onEnemyAttack = (dmg, dir, enemy) => this.onEnemyAttack(dmg, dir, enemy);
    this.world.onEnemySpawned = (enemy) => {
      if (this.state !== "playing") return;
      this.hud.showMsg(`${enemy.label} surgiu na neve…`, 2800);
    };
    this.world.onEnemyEvent = (ev, enemy) => {
      if (ev === "growl") {
        this.ambience.growl();
        const label = enemy?.label || "Um inimigo";
        this.hud.showMsg(`${label} te viu. Corra ou lute!`);
      } else if (ev === "npc_fight") {
        if (Math.random() < 0.08) {
          this.hud.showMsg("Inimigos estão brigando entre si!", 2200);
        }
      } else if (ev === "dead") {
        const drops = enemy?._lastDrops || [];
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
    this.hud.setTraps(this.traps.statusLine());
  }

  cycleTrap() {
    this.traps.cycle(1);
    this.refreshTrapUI();
    this.hud.showMsg(`Armadilha: ${this.traps.current.name}`, 1400);
  }

  /** Perto da fogueira: gasta 1 suprimento da mochila → 1 cerca. */
  tryCraftFence() {
    const fire = this.world.campfirePos;
    if (!fire) return;
    const dist = this.player.position.distanceTo(fire);
    if (dist > (CONFIG.trapPlaceMaxDist || 35)) {
      this.hud.showMsg("Craft só perto da fogueira da base.", 2200);
      return;
    }
    if (this.carried < 1) {
      this.hud.showMsg("Precisa de 1 suprimento na mochila (não depositado) para craftar cerca.", 3200);
      return;
    }
    this.carried--;
    this.traps.add("fence", 1);
    this.traps.selected = "fence";
    this.hud.setItems(this.carried, this.deposited, this.world.itemsTotal);
    this.refreshTrapUI();
    this.persistSave();
    this.hud.showMsg("Craft: 1 cerca improvisada. Coloque com F perto da fogueira.", 3600);
    this.tutorial?.notify("trap");
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
    const w = this.weapons.current;
    this.player.setHeldWeapon(w.id);
    this.refreshInventoryUI();
    this.hud.showMsg(`Equipado: ${w.name}`, 1600);
    return true;
  }

  refreshInventoryUI() {
    this.hud.renderInventory(this.weapons.slots());
  }

  updateGhostHud() {
    const sr = this.speedrun;
    if (sr.recordMs == null) {
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
    this.health = Math.max(0, this.health - dmg);
    this.player.applyKnockback(dir, enemy?.type === "wolf" ? 7 : 9);
    this.hud.flashDamage();
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
    this.closeHelp(true);
    this.dropCarriedOnDeath();
    this.persistSave();
    document.exitPointerLock();
    this.input.clearKeys();
    if (this.clickHint) this.clickHint.hidden = true;
    this.overlayTitle.textContent = "Você morreu";
    this.overlayMsg.textContent = `${reason} O que você carregava caiu no chão. Itens no baú estão seguros. Renasça na base.`;
    document.getElementById("btn-resume").textContent = "Renascer na base";
    const btnSkin = document.getElementById("btn-skin");
    if (btnSkin) btnSkin.hidden = true;
    this.overlay.hidden = false;
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    this.state = "won";
    clearMidRunSave();
    if (this.coop?.isHost) this.coop.broadcastEvent("win", {});
    const ms = this.speedrun.stop();
    this.ambience.victory();
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
    if (winList) winList.innerHTML = "<li>Carregando…</li>";
    if (rankList) rankList.innerHTML = "<li>Carregando…</li>";
    const entries = await fetchLeaderboard(10);
    this.leaderboard = entries || [];
    if (!entries?.length) {
      this.fillLeaderboardList(winList, []);
      this.fillLeaderboardList(rankList, []);
      return;
    }
    this.fillLeaderboardList(winList, entries);
    this.fillLeaderboardList(rankList, entries);
  }

  async submitWinScore() {
    const input = document.getElementById("player-name");
    const status = document.getElementById("score-status");
    const btn = document.getElementById("btn-submit-score");
    const name = (input?.value || "").trim() || "Sobrevivente";
    const ms = this.speedrun.finalMs ?? this.speedrun.ms;
    if (btn) btn.disabled = true;
    if (status) {
      status.textContent = "Enviando ao ranking online…";
      status.classList.remove("win-panel__status--ok", "win-panel__status--warn", "win-panel__status--err");
    }
    try {
      const data = await submitScore(name, ms);
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

    // bloom suave: sol, lua e vagalumes “brilham”
    this.bloomPass = new UnrealBloomPass(size, 0.35, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);

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
    const starCount = 900;
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

  // Ciclo de dia e noite: move sol/lua, mistura cores do céu e da névoa,
  // acende estrelas/vagalumes. Retorna o fator de noite (0..1).
  updateDayNight(dt) {
    this.dayTime = (this.dayTime + dt / CONFIG.world.dayLength) % 1;
    const t = this.dayTime * Math.PI * 2;
    const elev = Math.sin(t); // >0 dia, <0 noite

    const dayF = THREE.MathUtils.smoothstep(elev, -0.08, 0.25); // 0 noite, 1 dia
    const duskF = Math.max(0, 1 - Math.abs(elev) / 0.3); // perto do horizonte
    this.duskF = duskF;

    // direção do sol (a lua fica no lado oposto)
    // a área de sombra acompanha o jogador para manter nitidez
    const sunDir = new THREE.Vector3(Math.cos(t), Math.sin(t), 0.35).normalize();
    const anchor = this.player.position;
    this.sunLight.position.copy(anchor).addScaledVector(sunDir, 150);
    this.sunLight.target.position.copy(anchor);
    this.sunLight.intensity = Math.max(0, elev) * 0.95;
    this.sunLight.color.setHex(0xfff2d6).lerp(new THREE.Color(0xff8844), duskF);
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
    this._skyTop.copy(this._skyNight).lerp(new THREE.Color(0x6d9cc4), dayF);
    this._skyTop.lerp(this._skyDusk, duskF * 0.35);
    this._skyBottom.copy(this._skyNight).lerp(new THREE.Color(0xe8f0f7), dayF);
    this._skyBottom.lerp(new THREE.Color(0xffb070), duskF * 0.7);
    this.skyMat.uniforms.topColor.value.copy(this._skyTop);
    this.skyMat.uniforms.bottomColor.value.copy(this._skyBottom);

    // luzes gerais acompanham o dia
    this.hemi.intensity = 0.22 + dayF * 0.7;
    this.hemi.color.setHex(0xdceaff).lerp(new THREE.Color(0xffc090), duskF * 0.5);
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
      this.vignettePass.uniforms.darkness.value = 0.4 + night * 0.25 - aurora * 0.12;
    }
    // névoa ganha tom verde-azulado sob a aurora
    if (aurora > 0.05) {
      this.scene.fog.color.lerp(new THREE.Color(0x1a3a38), aurora * 0.35);
      this.hemi.color.lerp(new THREE.Color(0x88ffcc), aurora * 0.4);
      this.hemi.intensity = Math.max(this.hemi.intensity, 0.22 + aurora * 0.35);
    }

    this.hud.updateTime(this.dayTime, night);
    return night;
  }

  openHelp() {
    if (this.state === "won" || this.state === "dead" || this.state === "splash" || this.state === "skin") {
      return;
    }
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
    document.getElementById("btn-resume").addEventListener("click", () => this.resume());
    document.getElementById("btn-restart").addEventListener("click", () => this.restart());
    document.getElementById("btn-skin")?.addEventListener("click", () => this.openSkinPickerFromPause());
    document.getElementById("btn-submit-score")?.addEventListener("click", () => this.submitWinScore());
    document.getElementById("btn-help-close")?.addEventListener("click", () => this.closeHelp());
    document.getElementById("btn-rank-close")?.addEventListener("click", () => this.closeRank());
    document.getElementById("btn-rank-pause")?.addEventListener("click", () => this.openRank());
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
    window.addEventListener("neve-user-gesture", () => this.ambience.start(), { once: true });
    document.getElementById("skin-confirm")?.addEventListener(
      "click",
      () => this.ambience.start(),
      { once: true }
    );

    document.addEventListener("keydown", (e) => {
      // Desktop: nunca roubar teclas enquanto o foco está num input (código co-op / nome)
      if (Input.isTypingTarget(e.target) || Input.isTypingNow()) return;
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
        if (this.state === "playing" && this.tutorial?.active) {
          e.preventDefault();
          this.tutorial.skip();
          return;
        }
        if (this.state === "playing") this.pause();
      }
    });

    const unlock = () => {
      if (this.state === "playing" && !this.helpOpen && !this.rankOpen) {
        this.requestPointerLock();
        this.speedrun.start();
      }
    };
    this.canvas.addEventListener("click", unlock);
    window.addEventListener(
      "touchstart",
      () => {
        this.ambience.start();
        if (this.input.mobile) this.input.locked = true;
        this.speedrun.start();
      },
      { once: true, passive: true }
    );
  }

  requestPointerLock() {
    this.ambience.start(); // gesto do usuário: pode iniciar o áudio + trilha
    if (this.input.mobile) {
      this.input.locked = true;
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.canvas.focus({ preventScroll: true });
    this.canvas.requestPointerLock();
  }

  setCameraMode(mode) {
    this.cameraMode = mode === "third" ? "third" : "first";
    this.player.setCameraMode(this.cameraMode);
    this.hud.updateCameraMode(this.cameraMode);
  }

  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === "first" ? "third" : "first");
  }

  start() {
    this.setCameraMode(this.cameraMode);
    this.overlay.hidden = true;
    this.hud.show();
    this.state = "playing";
    if (this.input.mobile) this.setTouchUiVisible(true);
    this.input.attach();
    // Cronômetro começa ao entrar na partida (Novo jogo / Continuar), sem exigir clique no canvas
    if (this.speedrun.started) this.speedrun.resume();
    else this.speedrun.start();
    this.clock.start();
    this.loop();
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.speedrun.pause();
    this.persistSave();
    if (!this.input.mobile) document.exitPointerLock();
    this.input.clearKeys();
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
    this.overlay.hidden = false;
  }

  resume() {
    if (this.helpOpen) this.closeHelp(true);
    if (this.rankOpen) this.closeRank(true);
    if (this.state === "dead") {
      this.respawn();
      return;
    }
    if (this.state !== "paused") return;
    this.state = "playing";
    this.speedrun.resume();
    this.overlay.hidden = true;
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
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  update(dt) {
    if (this.state !== "playing") {
      this.input.endFrame();
      return;
    }

    if (this.clickHint) {
      this.clickHint.hidden = this.input.locked || this.input.mobile;
      if (this.input.mobile) {
        this.clickHint.textContent = "Toque na tela para começar (áudio + trilha)";
        this.clickHint.hidden = this.ambience.started;
      }
    }

    // Esc no desktop: bindUI. Tap pause no celular:
    if (this.input._tapEsc) {
      this.input._tapEsc = false;
      if (this.tutorial?.active) this.tutorial.skip();
      else this.pause();
    }

    this._saveAcc = (this._saveAcc || 0) + dt;
    if (this._saveAcc >= 25) {
      this._saveAcc = 0;
      this.persistSave();
    }

    if (this.input.wasPressed("KeyR")) {
      const r = this.weapons.reload();
      if (r.msg) this.hud.showMsg(r.msg, 2200);
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
        this.equipWeapon(pick.id);
        this.tutorial?.notify("equip");
      }
    }
    if (this.input.wasPressed("KeyB") || this.input._tapInv) {
      this.input._tapInv = false;
      const open = this.hud.toggleInventoryExpanded();
      // evita tecla B presa (pointer lock / keyup perdido)
      this.input.releaseKeys("KeyB");
      this.hud.showMsg(open ? "Armas abertas — B ou ✕ esconde" : "Armas escondidas — B mostra", 1600);
      this.tutorial?.notify("inventory");
      // no desktop, solta o mouse um instante para clicar nos slots
      if (open && !this.input.mobile && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
    if (this.input._tapWeapon) {
      this.input._tapWeapon = false;
      this.weapons.cycle(1);
      this.player.setHeldWeapon(this.weapons.current.id);
      this.refreshInventoryUI();
      this.hud.showMsg(`Equipado: ${this.weapons.current.name}`, 1600);
      this.tutorial?.notify("equip");
    }
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
    if (this.input.locked || this.input.mobile || this.input.rightDown) {
      this.player.applyLook(mouseDelta);
    }
    this.player.applyKeyboardLook(dt, this.input);
    if (this.input.toggleCamera) this.toggleCameraMode();

    this.player.update(dt, this.input);
    this.coop?.tick(dt);

    const night = this.updateDayNight(dt);
    this.world.update(dt, this.clock.elapsedTime, night, this.duskF, this.player.position);

    this.updateInteractions(dt);
    this.updateSurvival(dt, night);
    this.updateEnemyHud();
    this.drawMinimap();

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
    if (item) {
      this.hud.setHint(`[${useKey}] Pegar ${item.name}`);
    } else if (chestDist < 3.2 && this.carried > 0) {
      this.hud.setHint(`[${useKey}] Depositar ${this.carried} ${this.carried === 1 ? "item" : "itens"} no baú`);
    } else if (giftNear) {
      this.hud.setHint("✦ Cristal de gelo por perto — aproxime-se");
    } else {
      this.hud.setHint(null);
    }

    if (this.input.interact) {
      if (item) {
        this.world.collectItem(item);
        this.coop?.broadcastEvent("pickup", { saveId: item.saveId });
        const loot = this.weapons.onCollectItem(item);
        const gotTrap = this.traps.onCollectItem(item);
        if (item.countsForWin !== false) this.carried++;
        this.ambience.pickup();
        // sempre sincroniza mesh da arma equipada após loot
        this.player.setHeldWeapon(this.weapons.current.id);
        this.refreshInventoryUI();
        this.refreshTrapUI();
        this.tutorial?.notify("pickup");
        if (loot.unlocked) {
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
          this.hud.showMsg(`+ armadilha: ${item.name} · perto da fogueira [G] tipo [F] colocar`, 3200);
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
            `Suprimento: ${item.name} — leve ao baú (E) · ${this.carried} na mochila`,
            3000
          );
        } else {
          this.hud.showMsg(`Você pegou: ${item.name}`);
        }
      } else if (chestDist < 3.2 && this.carried > 0) {
        this.deposited += this.carried;
        this.carried = 0;
        this.ambience.deposit();
        this.tutorial?.notify("deposit");
        this.persistSave();
        this.coop?.broadcastEvent("deposit", { deposited: this.deposited });
        this.hud.showMsg(
          `Baú: ${this.deposited}/${this.world.itemsTotal} guardados (só o baú conta na vitória)`,
          3200
        );
        if (this.deposited >= this.world.itemsTotal) this.win();
      }
      this.hud.setItems(this.carried, this.deposited, this.world.itemsTotal);
    }

    // ataque com arma equipada (melee, hitscan, projétil ou granada)
    const weapon = this.weapons.current;
    this.attackCd -= dt;
    const wantFire = weapon.auto ? clicks.left || this.input.leftHeld : clicks.left;
    if (wantFire && (this.input.locked || this.input.mobile) && this.attackCd <= 0) {
      this.fireWeapon(weapon, p);
      this.tutorial?.notify("attack");
    }
  }

  fireWeapon(weapon, p) {
    // sem munição: clique seco
    if (weapon.ammoType && !this.weapons.canFire()) {
      this.attackCd = 0.35;
      const at = CONFIG.ammoTypes[weapon.ammoType];
      const needsReload = (weapon.magSize || 0) > 0;
      this.hud.showMsg(
        needsReload
          ? `Carregador vazio — pressione R (reserva: ${this.weapons.ammo[weapon.ammoType] ?? 0})`
          : `Sem ${at?.name?.toLowerCase() || "munição"}!`,
        2000
      );
      if (this.ambience.started) this.ambience.noiseBurst(0.04, 0.05, 1800, 2);
      return;
    }

    this.attackCd = weapon.cooldown || CONFIG.player.attackCooldown;
    this.weapons.consumeAmmo();
    this.player.setHeldWeapon(weapon.id);
    this.player.playAttack(weapon.fire === "hitscan" || weapon.fire === "projectile" ? "ranged" : "melee");

    const origin = this.player.eyePosition;
    const dir = this.player.lookDirection.clone().normalize();

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
        if (this.world.hitscan(origin, d, weapon.damage, weapon.range)) hitAny = true;
      }
      this.ambience.weaponFire(weapon);
      if (hitAny) this.ambience.bearHit();
    } else if (weapon.fire === "projectile") {
      this.world.spawnProjectile({
        pos: origin.clone().addScaledVector(dir, 0.6),
        dir,
        speed: weapon.projSpeed || 34,
        damage: weapon.damage,
        kind: "arrow",
      });
      this.ambience.weaponFire(weapon);
    } else if (weapon.fire === "thrown") {
      const lob = dir.clone();
      lob.y += 0.35;
      lob.normalize();
      this.world.spawnProjectile({
        pos: origin.clone().addScaledVector(dir, 0.6),
        dir: lob,
        speed: weapon.projSpeed || 16,
        damage: weapon.damage,
        kind: "grenade",
        fuse: 2.0,
        explodeRadius: weapon.explodeRadius || 6,
      });
      this.ambience.weaponFire(weapon);
    } else {
      // melee
      this.ambience.weaponFire(weapon);
      const hit = this.world.damageEnemyAt(p, weapon.damage, weapon.range, {
        slowElite: weapon.slowElite || 0,
      });
      if (hit) {
        this.ambience.bearHit();
      }
    }
    if (weapon.ammoType) this.refreshInventoryUI();
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
      const drain = night > 0.5 ? s.warmthDrainNight : s.warmthDrainDay;
      this.warmth = Math.max(0, this.warmth - drain * dt);

      // avisos claros — o frio não mata “do nada”
      if (this.warmth < 35 && !this._coldWarned) {
        this._coldWarned = true;
        this.hud.showMsg("Está esfriando... volte para a fogueira.");
      }

      if (this.warmth <= 0) {
        // dano de frio, mas NUNCA mata — só o urso pode matar
        const floor = s.coldMinHealth ?? 20;
        this.health = Math.max(floor, this.health - s.coldDamage * dt);
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

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.composer.render();
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
