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
  createSlenderMesh,
  createChuckMesh,
  createPteroMesh,
} from "../enemies.js";

const SNAP_HZ = 12;
const SNAP_HZ_HTTP = 6;

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
        ? " Relay HTTPS (firewall OK, um pouco mais de lag)."
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
      r.position.set(msg.x, msg.y, msg.z);
      r.yaw = msg.yaw || 0;
      r.pitch = 0;
      if (msg.skin && msg.skin !== r.skinId) applySkinToPlayer(r, msg.skin);
      if (msg.weapon) r.setHeldWeapon(msg.weapon);
      r.syncMesh();
      r.animateLimbs(1 / 30, true);
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
      g.world?.applySeason?.(g.getSeason?.());
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
        r.position.set(p.x, p.y, p.z);
        r.yaw = p.yaw || 0;
        if (p.skin && p.skin !== r.skinId) applySkinToPlayer(r, p.skin);
        if (p.weapon) r.setHeldWeapon(p.weapon);
        r.syncMesh();
        r.animateLimbs(1 / SNAP_HZ, true);
      }
    } else if (msg.hostPose) {
      const r = this.ensureRemote("host");
      const p = msg.hostPose;
      r.position.set(p.x, p.y, p.z);
      r.yaw = p.yaw || 0;
      if (p.skin && p.skin !== r.skinId) applySkinToPlayer(r, p.skin);
      if (p.weapon) r.setHeldWeapon(p.weapon);
      r.syncMesh();
      r.animateLimbs(1 / SNAP_HZ, true);
    }
  }

  _makeEnemyMesh(type, world) {
    const tex = world.tex;
    if (type === "wolf") return createWolfMesh(tex);
    if (type === "snow_fox" || type === "fox") return createSnowFoxMesh(tex);
    if (type === "werewolf") return createWerewolfMesh(tex);
    if (type === "mula") return createMulaMesh(tex);
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
      }
      ent.hp = e.hp;
      if (e.hp <= 0) ent.hp = 0;
      ent.mesh.position.set(e.x, world.groundHeight(e.x, e.z), e.z);
      ent.mesh.rotation.y = e.yaw || 0;
      ent.mesh.visible = e.hp > 0;
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

    this.room.send({
      t: "pose",
      id,
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      yaw: p.yaw,
      skin: p.skinId,
      weapon: g.weapons?.current?.id || "fists",
    });

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
      poses.push({
        id: pid,
        x: r.position.x,
        y: r.position.y,
        z: r.position.z,
        yaw: r.yaw,
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
