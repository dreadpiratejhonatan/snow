import * as THREE from "three";
import { Player } from "../player.js";
import { applySkinToPlayer } from "../skins.js";
import {
  Enemy,
  createBearMesh,
  createWolfMesh,
  createWerewolfMesh,
  createMulaMesh,
  createSlenderMesh,
  createChuckMesh,
} from "../enemies.js";

const SNAP_HZ = 12;

/** Sessão co-op: avatares + snapshots host→guest. */
export class CoopSession {
  constructor(game, room) {
    this.game = game;
    this.room = room;
    this.role = room.role;
    this.seed = room.seed;
    this.code = room.code;
    this.remote = null;
    this._snapAcc = 0;
    this._remoteNetEnemies = new Map();
    this.partnerName = "Parceiro";

    room.onMessage = (msg) => this.onMessage(msg);
    room.onClose = (why) => {
      game.hud?.showMsg(`Co-op desconectado (${why})`, 4000);
      this.disposeRemote();
    };
  }

  get isHost() {
    return this.role === "host";
  }

  get isGuest() {
    return this.role === "guest";
  }

  ensureRemote() {
    if (this.remote) return this.remote;
    const g = this.game;
    const dummyCam = new THREE.PerspectiveCamera(70, 1, 0.1, 10);
    const spawn = g.world.getSpawn().clone();
    spawn.x += this.isHost ? 2.2 : -2.2;
    this.remote = new Player(dummyCam, g.scene, g.world, spawn);
    this.remote.mesh.visible = true;
    this.remote.setCameraMode("third");
    if (this.remote.fpWeaponRoot) this.remote.fpWeaponRoot.visible = false;
    return this.remote;
  }

  disposeRemote() {
    if (!this.remote) return;
    this.game.scene.remove(this.remote.mesh);
    this.remote = null;
    for (const e of this._remoteNetEnemies.values()) {
      this.game.scene.remove(e.mesh);
    }
    this._remoteNetEnemies.clear();
  }

  /** Chamado quando DataChannel abre. */
  onConnected() {
    this.ensureRemote();
    const skin = this.game.player.skinId || "natan";
    this.room.send({
      t: "hello",
      role: this.role,
      skin,
      name: "Player",
    });
    this.game.hud?.showMsg(
      this.isHost
        ? `Co-op ativo — sala ${this.code}. Você é o host.`
        : `Co-op ativo — conectado ao host.`,
      4500
    );
  }

  onMessage(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "hello") {
      this.ensureRemote();
      if (msg.skin) applySkinToPlayer(this.remote, msg.skin);
      if (msg.name) this.partnerName = msg.name;
      return;
    }
    if (msg.t === "pose") {
      this.ensureRemote();
      this.remote.position.set(msg.x, msg.y, msg.z);
      this.remote.yaw = msg.yaw || 0;
      this.remote.pitch = 0;
      if (msg.skin && msg.skin !== this.remote.skinId) {
        applySkinToPlayer(this.remote, msg.skin);
      }
      if (msg.weapon) this.remote.setHeldWeapon(msg.weapon);
      this.remote.syncMesh();
      this.remote.animateLimbs(1 / 30, true);
      return;
    }
    if (msg.t === "snap" && this.isGuest) {
      this.applySnapshot(msg);
      return;
    }
    if (msg.t === "event") {
      this.applyEvent(msg);
    }
  }

  applyEvent(msg) {
    const g = this.game;
    if (msg.kind === "deposit") {
      g.deposited = Math.max(g.deposited, msg.deposited ?? 0);
      g.hud.setItems(g.carried, g.deposited, g.world.itemsTotal);
      g.hud.showMsg(`${this.partnerName} depositou no baú (${g.deposited}/${g.world.itemsTotal})`, 2800);
      if (this.isHost && g.deposited >= g.world.itemsTotal && !g.ended) g.win();
    } else if (msg.kind === "pickup" && msg.saveId && this.isGuest) {
      const it = g.world.items?.find((i) => i.saveId === msg.saveId && !i.collected);
      if (it) {
        g.world.collectItem(it);
        g.hud.showMsg(`${this.partnerName} pegou ${it.name}`, 2200);
      }
    } else if (msg.kind === "win" && this.isGuest && !g.ended) {
      g.win();
    }
  }

  applySnapshot(msg) {
    const g = this.game;
    if (typeof msg.dayTime === "number") g.dayTime = msg.dayTime;
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
    if (msg.hostPose) {
      this.ensureRemote();
      const p = msg.hostPose;
      this.remote.position.set(p.x, p.y, p.z);
      this.remote.yaw = p.yaw || 0;
      if (p.skin && p.skin !== this.remote.skinId) applySkinToPlayer(this.remote, p.skin);
      if (p.weapon) this.remote.setHeldWeapon(p.weapon);
      this.remote.syncMesh();
      this.remote.animateLimbs(1 / SNAP_HZ, true);
    }
  }

  _makeEnemyMesh(type, world) {
    const tex = world.tex;
    if (type === "wolf") return createWolfMesh(tex);
    if (type === "werewolf") return createWerewolfMesh(tex);
    if (type === "mula") return createMulaMesh(tex);
    if (type === "slender") return createSlenderMesh(tex);
    if (type === "chuck") return createChuckMesh(tex);
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

  /** Host: não usa inimigos puppet; guest: world.enemies AI off. */
  tick(dt) {
    if (!this.room?.isOpen) return;
    const g = this.game;
    const p = g.player;

    // pose contínua (ambos)
    this.room.send({
      t: "pose",
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      yaw: p.yaw,
      skin: p.skinId,
      weapon: g.weapons?.current?.id || "fists",
    });

    if (!this.isHost) return;

    this._snapAcc += dt;
    if (this._snapAcc < 1 / SNAP_HZ) return;
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

    this.room.send({
      t: "snap",
      dayTime: g.dayTime,
      deposited: g.deposited,
      collected,
      enemies,
      hostPose: {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        yaw: p.yaw,
        skin: p.skinId,
        weapon: g.weapons?.current?.id || "fists",
      },
    });
  }

  broadcastEvent(kind, payload = {}) {
    if (!this.room?.isOpen) return;
    this.room.send({ t: "event", kind, ...payload });
  }
}
