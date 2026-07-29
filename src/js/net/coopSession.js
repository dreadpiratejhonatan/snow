import * as THREE from "three";
import { CONFIG } from "../config.js";
import { Player } from "../player.js";
import { applySkinToPlayer } from "../skins.js";
import {
  Enemy,
  createBearMesh,
  createWolfMesh,
  createSnowFoxMesh,
  createWerewolfMesh,
  createMulaMesh,
  createHorseMesh,
  createDromedaryMesh,
  createPonyMesh,
  createSlenderMesh,
  createChuckMesh,
  createPteroMesh,
  createPandaMesh,
} from "../enemies.js";

/** Snapshots do mundo host→guest (Hz). */
const SNAP_HZ = 15;
const SNAP_HZ_HTTP = 10;
/** Pose do jogador local (Hz). HTTP fica um pouco abaixo para não saturar o relay. */
const POSE_HZ = 22;
const POSE_HZ_HTTP = 14;
/** Snap do host só sobrescreve pose se o peer estiver “silencioso” (ms). */
const SNAP_POSE_STALE_MS = 220;
/** Distância (m) acima da qual o remoto teleporta em vez de interpolar. */
const SNAP_DIST = 12;
const MAX_SPEED = 18;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Sessão co-op: avatares remotos (2–4) + snapshots host→guest. */
export class CoopSession {
  constructor(game, room) {
    this.game = game;
    this.room = room;
    this.role = room.role;
    this.seed = room.seed;
    this.code = room.code;
    /** @type {Map<string, import("../player.js").Player>} */
    this.remotes = new Map();
    this._names = new Map();
    this._snapAcc = 0;
    this._poseAcc = 0;
    this._lastPoseX = 0;
    this._lastPoseZ = 0;
    this._hasLastPose = false;
    this._remoteNetEnemies = new Map();
    this.partnerName = "Parceiro";

    room.onMessage = (msg) => this.onMessage(msg);
    room.onClose = (why) => {
      game.showCoopReconnect?.(why, this.role);
      this.disposeRemotes();
    };
  }

  get isHost() {
    return this.role === "host";
  }

  get isGuest() {
    return this.role === "guest";
  }

  /** Compat: primeiro remoto (2P). */
  get remote() {
    return this.remotes.values().next().value || null;
  }

  peerKey(msg) {
    return msg?.from || msg?.id || msg?.peerId || "partner";
  }

  ensureRemote(peerId = "partner") {
    if (this.remotes.has(peerId)) return this.remotes.get(peerId);
    const g = this.game;
    const dummyCam = new THREE.PerspectiveCamera(70, 1, 0.1, 10);
    const spawn = g.world.getSpawn().clone();
    const idx = this.remotes.size;
    const ang = (idx / Math.max(1, (this.room.maxPlayers || 4) - 1)) * Math.PI * 2;
    spawn.x += Math.cos(ang) * 2.4;
    spawn.z += Math.sin(ang) * 2.4;
    const remote = new Player(dummyCam, g.scene, g.world, spawn);
    remote.mesh.visible = true;
    remote.setCameraMode("third");
    if (remote.fpWeaponRoot) remote.fpWeaponRoot.visible = false;
    remote._coopNet = null;
    this.remotes.set(peerId, remote);
    return remote;
  }

  disposeRemotes() {
    for (const remote of this.remotes.values()) {
      this.game.scene.remove(remote.mesh);
    }
    this.remotes.clear();
    this._names.clear();
    for (const e of this._remoteNetEnemies.values()) {
      this.game.scene.remove(e.mesh);
    }
    this._remoteNetEnemies.clear();
  }

  disposeRemote() {
    this.disposeRemotes();
  }

  /** Chamado quando o canal abre (P2P ou relay HTTPS). */
  onConnected() {
    const skin = this.game.player.skinId || "natan";
    const name =
      this.game.chat?.displayName?.() || CONFIG.skins?.[skin]?.name || "Player";
    this.room.send({
      t: "hello",
      role: this.role,
      id: this.room.peerId || this.role,
      skin,
      name,
    });
    const via =
      this.room.transport === "http"
        ? " Relay HTTPS (firewall OK — sync suavizado)."
        : " P2P direto.";
    const cap = this.room.maxPlayers || 2;
    this.game.hud?.showMsg(
      this.isHost
        ? `Co-op ativo — sala ${this.code} (até ${cap}). Você é o host.${via}`
        : `Co-op ativo — ligado ao host (até ${cap}).${via}`,
      5000
    );
    this.game.hideCoopReconnect?.();
  }

  onMessage(msg) {
    if (!msg || !msg.t) return;
    const selfId = this.room.peerId || this.role;
    const from = this.peerKey(msg);
    if (from === selfId) return;

    if (msg.t === "hello") {
      const r = this.ensureRemote(from);
      if (msg.skin) applySkinToPlayer(r, msg.skin);
      if (msg.name) {
        this._names.set(from, msg.name);
        this.partnerName = msg.name;
      }
      return;
    }
    if (msg.t === "pose") {
      const r = this.ensureRemote(from);
      this._setRemotePose(r, msg, { fromPeer: true });
      return;
    }
    if (msg.t === "snap" && this.isGuest) {
      this.applySnapshot(msg);
      return;
    }
    if (msg.t === "chat") {
      this.game.chat?.onRemote(msg);
      return;
    }
    if (msg.t === "event") {
      this.applyEvent(msg);
    }
  }

  /**
   * Atualiza alvo de interpolação do avatar remoto.
   * @param {{ fromPeer?: boolean, force?: boolean }} [opts]
   */
  _setRemotePose(r, msg, opts = {}) {
    const now = performance.now();
    let n = r._coopNet;
    if (!n) {
      n = r._coopNet = {
        tx: msg.x,
        ty: msg.y,
        tz: msg.z,
        tyaw: msg.yaw || 0,
        vx: 0,
        vz: 0,
        lastAt: now,
        fromPeerAt: 0,
      };
      r.position.set(msg.x, msg.y, msg.z);
      r.yaw = msg.yaw || 0;
      r.pitch = 0;
      if (msg.skin && msg.skin !== r.skinId) applySkinToPlayer(r, msg.skin);
      if (msg.weapon) r.setHeldWeapon(msg.weapon);
      r.syncMesh();
      return;
    }

    if (!opts.force && !opts.fromPeer && n.fromPeerAt && now - n.fromPeerAt < SNAP_POSE_STALE_MS) {
      // Peer ainda manda pose fresca — snap do host não sobrescreve
      if (msg.skin && msg.skin !== r.skinId) applySkinToPlayer(r, msg.skin);
      if (msg.weapon) r.setHeldWeapon(msg.weapon);
      return;
    }

    const dt = Math.max(0.02, (now - n.lastAt) / 1000);
    if (typeof msg.vx === "number" && typeof msg.vz === "number") {
      n.vx = msg.vx;
      n.vz = msg.vz;
    } else {
      n.vx = (msg.x - n.tx) / dt;
      n.vz = (msg.z - n.tz) / dt;
    }
    const sp = Math.hypot(n.vx, n.vz);
    if (sp > MAX_SPEED) {
      n.vx *= MAX_SPEED / sp;
      n.vz *= MAX_SPEED / sp;
    }

    n.tx = msg.x;
    n.ty = msg.y;
    n.tz = msg.z;
    n.tyaw = msg.yaw || 0;
    n.lastAt = now;
    if (opts.fromPeer) n.fromPeerAt = now;

    r.pitch = 0;
    if (msg.skin && msg.skin !== r.skinId) applySkinToPlayer(r, msg.skin);
    if (msg.weapon) r.setHeldWeapon(msg.weapon);
  }

  /** Suaviza avatares remotos a cada frame (lerp + leve extrapolação). */
  updateRemotes(dt) {
    const now = performance.now();
    const http = this.room.transport === "http";
    const rate = http ? 16 : 20;
    const blend = 1 - Math.exp(-dt * rate);
    const extrapCap = http ? 0.1 : 0.06;

    for (const r of this.remotes.values()) {
      const n = r._coopNet;
      if (!n) continue;

      const age = Math.max(0, (now - n.lastAt) / 1000);
      let tx = n.tx;
      let ty = n.ty;
      let tz = n.tz;
      if (age > 0 && age < 0.14) {
        const e = Math.min(age, extrapCap);
        tx += n.vx * e;
        tz += n.vz * e;
      }

      const dx = tx - r.position.x;
      const dy = ty - r.position.y;
      const dz = tz - r.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > SNAP_DIST || !Number.isFinite(dist)) {
        r.position.set(tx, ty, tz);
        r.yaw = n.tyaw;
      } else {
        r.position.x += dx * blend;
        r.position.y += dy * blend;
        r.position.z += dz * blend;
        r.yaw = lerpAngle(r.yaw, n.tyaw, blend);
      }

      const moving = Math.hypot(n.vx, n.vz) > 0.35 || age < 0.22;
      r.syncMesh();
      r.animateLimbs(dt, moving);
    }

    // Inimigos-puppet (guest): lerp em vez de teleporte
    const eBlend = 1 - Math.exp(-dt * 12);
    const world = this.game.world;
    for (const ent of this._remoteNetEnemies.values()) {
      if (ent._netTx == null) continue;
      const mx = ent.mesh.position.x;
      const mz = ent.mesh.position.z;
      const edx = ent._netTx - mx;
      const edz = ent._netTz - mz;
      if (Math.hypot(edx, edz) > SNAP_DIST) {
        ent.mesh.position.set(ent._netTx, world.groundHeight(ent._netTx, ent._netTz), ent._netTz);
        ent.mesh.rotation.y = ent._netTyaw || 0;
      } else {
        const nx = mx + edx * eBlend;
        const nz = mz + edz * eBlend;
        ent.mesh.position.set(nx, world.groundHeight(nx, nz), nz);
        ent.mesh.rotation.y = lerpAngle(ent.mesh.rotation.y, ent._netTyaw || 0, eBlend);
      }
    }
  }

  applyEvent(msg) {
    const g = this.game;
    const who = msg.name || this.partnerName || "Parceiro";
    if (msg.kind === "deposit") {
      g.deposited = Math.max(g.deposited, msg.deposited ?? 0);
      g.hud.setItems(g.carried, g.deposited, g.world.itemsTotal);
      g.hud.showMsg(`${who} depositou no baú (${g.deposited}/${g.world.itemsTotal})`, 2800);
      if (this.isHost && !g.ended) g.checkWin?.();
    } else if (msg.kind === "pickup" && msg.saveId) {
      const it = g.world.items?.find((i) => i.saveId === msg.saveId && !i.collected);
      if (it) {
        g.world.collectItem(it);
        g.hud.showMsg(`${who} pegou ${it.name}`, 2200);
      }
    } else if (msg.kind === "hit" && this.isHost && msg.id != null) {
      const id = msg.id;
      const dmg = Math.max(1, Math.min(200, Number(msg.dmg) || 0));
      let ent =
        (g.world.enemies || []).find((e) => e.netId === id) ||
        this._remoteNetEnemies.get(id);
      if (ent?.alive) {
        g.world._applyDamage(ent, dmg, { fromHost: true });
      }
    } else if (msg.kind === "win" && this.isGuest && !g.ended) {
      g.win();
    }
  }

  applySnapshot(msg) {
    const g = this.game;
    if (typeof msg.dayTime === "number") g.dayTime = msg.dayTime;
    if (typeof msg.seasonIndex === "number" && msg.seasonIndex !== g.seasonIndex) {
      g.seasonIndex = msg.seasonIndex;
      if (typeof g.applySeasonVisual === "function" && typeof g.computeSeasonVisual === "function") {
        g.applySeasonVisual(g.computeSeasonVisual());
      } else {
        g.world?.applySeason?.(g.getSeason?.());
      }
    }
    if (typeof msg.seasonDayAcc === "number") g.seasonDayAcc = msg.seasonDayAcc;
    if (typeof msg.deposited === "number") {
      g.deposited = Math.max(g.deposited, msg.deposited);
      g.hud.setItems(g.carried, g.deposited, g.world.itemsTotal);
    }
    if (Array.isArray(msg.collected)) {
      for (const id of msg.collected) {
        const it = g.world.items?.find((i) => i.saveId === id && !i.collected);
        if (it) g.world.collectItem(it);
      }
    }
    if (Array.isArray(msg.enemies)) {
      this.applyEnemySnapshot(msg.enemies);
    }
    if (Array.isArray(msg.poses)) {
      for (const p of msg.poses) {
        if (!p?.id || p.id === (this.room.peerId || this.role)) continue;
        const r = this.ensureRemote(p.id);
        this._setRemotePose(r, p, { fromPeer: false });
      }
    } else if (msg.hostPose) {
      const r = this.ensureRemote("host");
      this._setRemotePose(r, msg.hostPose, { fromPeer: false });
    }
  }

  _makeEnemyMesh(type, world) {
    const tex = world.tex;
    if (type === "wolf") return createWolfMesh(tex);
    if (type === "snow_fox" || type === "fox") return createSnowFoxMesh(tex);
    if (type === "werewolf") return createWerewolfMesh(tex);
    if (type === "mula") return createMulaMesh(tex);
    if (type === "horse") return createHorseMesh(tex);
    if (type === "dromedary") return createDromedaryMesh(tex);
    if (type === "pony") return createPonyMesh(tex);
    if (type === "panda") return createPandaMesh(tex);
    if (type === "slender") return createSlenderMesh(tex);
    if (type === "chuck") return createChuckMesh(tex);
    if (type === "ptero") return createPteroMesh();
    if (type === "bear_elite") {
      return createBearMesh(tex, { scale: 1.45, color: 0x3a2a1c, dark: 0x1e1510 });
    }
    return createBearMesh(tex, { scale: 1, color: 0x7a5c42, dark: 0x54402a });
  }

  applyEnemySnapshot(list) {
    const world = this.game.world;
    const byId = new Map((world.enemies || []).map((e) => [e.netId, e]));
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id);
      let ent = byId.get(e.id) || this._remoteNetEnemies.get(e.id);
      if (!ent) {
        const mesh = this._makeEnemyMesh(e.type, world);
        const home = new THREE.Vector3(e.x, 0, e.z);
        ent = new Enemy(e.type, mesh, home, world);
        ent.netId = e.id;
        ent._netPuppet = true;
        world.scene.add(mesh);
        this._remoteNetEnemies.set(e.id, ent);
        mesh.position.set(e.x, world.groundHeight(e.x, e.z), e.z);
        mesh.rotation.y = e.yaw || 0;
      }
      ent.hp = e.hp;
      if (e.hp <= 0) ent.hp = 0;
      ent._netTx = e.x;
      ent._netTz = e.z;
      ent._netTyaw = e.yaw || 0;
      ent.mesh.visible = e.hp > 0;
      // spawn / morte: encaixa na hora
      if (!ent.mesh.visible || ent._netSnapOnce == null) {
        ent.mesh.position.set(e.x, world.groundHeight(e.x, e.z), e.z);
        ent.mesh.rotation.y = e.yaw || 0;
        ent._netSnapOnce = true;
      }
    }
    for (const [id, ent] of this._remoteNetEnemies) {
      if (!seen.has(id)) {
        world.scene.remove(ent.mesh);
        this._remoteNetEnemies.delete(id);
      }
    }
  }

  tick(dt) {
    if (!this.room?.isOpen) return;
    const g = this.game;
    const p = g.player;
    const id = this.room.peerId || this.role;

    this._poseAcc += dt;
    const poseHz = this.room.transport === "http" ? POSE_HZ_HTTP : POSE_HZ;
    if (this._poseAcc >= 1 / poseHz) {
      const sendDt = this._poseAcc;
      this._poseAcc = 0;
      let vx = 0;
      let vz = 0;
      if (this._hasLastPose) {
        vx = (p.position.x - this._lastPoseX) / sendDt;
        vz = (p.position.z - this._lastPoseZ) / sendDt;
        const sp = Math.hypot(vx, vz);
        if (sp > MAX_SPEED) {
          vx *= MAX_SPEED / sp;
          vz *= MAX_SPEED / sp;
        }
      }
      this._lastPoseX = p.position.x;
      this._lastPoseZ = p.position.z;
      this._hasLastPose = true;
      this.room.send({
        t: "pose",
        id,
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        yaw: p.yaw,
        vx,
        vz,
        skin: p.skinId,
        weapon: g.weapons?.current?.id || "fists",
      });
    }

    this.updateRemotes(dt);

    if (!this.isHost) return;

    this._snapAcc += dt;
    const snapHz = this.room.transport === "http" ? SNAP_HZ_HTTP : SNAP_HZ;
    if (this._snapAcc < 1 / snapHz) return;
    this._snapAcc = 0;

    const enemies = (g.world.enemies || [])
      .filter((e) => e.alive)
      .slice(0, 24)
      .map((e) => ({
        id: e.netId || 0,
        type: e.type,
        x: e.mesh.position.x,
        z: e.mesh.position.z,
        yaw: e.mesh.rotation.y,
        hp: e.hp,
      }));

    const collected = (g.world.items || []).filter((i) => i.collected && i.saveId).map((i) => i.saveId);

    const poses = [
      {
        id: "host",
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        yaw: p.yaw,
        skin: p.skinId,
        weapon: g.weapons?.current?.id || "fists",
      },
    ];
    for (const [pid, r] of this.remotes) {
      const n = r._coopNet;
      poses.push({
        id: pid,
        x: n ? n.tx : r.position.x,
        y: n ? n.ty : r.position.y,
        z: n ? n.tz : r.position.z,
        yaw: n ? n.tyaw : r.yaw,
        skin: r.skinId,
        weapon: r.weaponIdHeld || "fists",
      });
    }

    this.room.send({
      t: "snap",
      dayTime: g.dayTime,
      seasonIndex: g.seasonIndex ?? 0,
      seasonDayAcc: g.seasonDayAcc ?? 0,
      deposited: g.deposited,
      collected,
      enemies,
      poses,
      hostPose: poses[0],
    });
  }

  broadcastEvent(kind, payload = {}) {
    if (!this.room?.isOpen) return;
    const skin = this.game.player?.skinId;
    const name =
      this.game.chat?.displayName?.() || CONFIG.skins?.[skin]?.name || "Player";
    this.room.send({ t: "event", kind, name, ...payload });
  }
}
