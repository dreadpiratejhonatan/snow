import * as THREE from "three";
import { CONFIG } from "./config.js";
import { makeTextures } from "./textures.js";
import { createRng, randomSeed } from "./rng.js";
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
  createPandaMesh,
  createSaciMesh,
  createTrexMesh,
  createBotoMesh,
  createPteroMesh,
  spawnPointFar,
  spawnPointOnIce,
} from "./enemies.js";
import { getDifficulty } from "./difficulty.js";

// Mundo de inverno: terreno nevado por heightmap, lago congelado onde dá
// para andar, nevasca, base com fogueira e baú, itens escondidos e um urso.
export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.seed = (opts.seed ?? randomSeed()) >>> 0;
    this.mapMode = opts.mapMode === "random" ? "random" : "classic";
    this.authority = opts.authority !== false; // guest co-op: false (host simula inimigos)
    this.lowFx = !!opts.lowFx; // perfil celular: menos partículas / grama
    this._snowFrame = 0;
    this._nextNetId = 1;
    // layout (classic defaults; random sobrescreve em _initLayout)
    this.home = { x: 0, z: 0 };
    this.campfireOffset = { x: 3, z: 2 };
    this.baseOffset = { x: -4.5, z: -3 };
    this.spawnOffset = { x: 0, z: 0 };
    this.heightWarp = null;
    this.size = CONFIG.world.size;
    this.half = this.size / 2;
    this.bounds = this.half - 4;
    this.waterLevel = CONFIG.world.waterLevel;
    this.colliders = []; // troncos/rochas/base: { x, z, y, r }
    this.dungeonZone = null; // bolso da dungeon secreta (setado pela SecretDungeon)
    this.dungeonActive = false; // player está dentro da arena
    this.trees = [];
    this.snowCaps = []; // neve do telhado etc. (visibilidade por estação)
    this.diff = getDifficulty("medium");
    this._diffSpawnScaled = false;
    this._diffLootThinned = false;

    // callbacks preenchidos pelo Game
    this.onEnemyAttack = null; // (damage, dirVector, enemy)
    this.onEnemyEvent = null; // ('growl' | 'dead', enemy)
    this.onAurora = null; // ('start' | 'gift')
    // aliases legados
    this.onBearAttack = null;
    this.onBearEvent = null;

    this.tex = makeTextures();
    const T = this.tex;
    this.trunkMat = new THREE.MeshStandardMaterial({
      color: 0x6b5340,
      roughness: 1,
      map: T.bark || null,
      bumpMap: T.barkBump || null,
      bumpScale: 0.5,
    });
    this._leafBase = [0x3d6a4c, 0x477455, 0x365e45];
    this.leafMats = this._leafBase.map(
      (hex) =>
        new THREE.MeshStandardMaterial({ color: hex, roughness: 1, map: T.foliage || null })
    );
    this.snowCapMat = new THREE.MeshStandardMaterial({
      color: 0xf6fafd,
      roughness: 1,
      map: T.snow || null,
    });
    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0x9a9ea6,
      roughness: 1,
      map: T.rock || null,
      bumpMap: T.rockBump || null,
      bumpScale: 0.6,
    });
    this.woodMat = new THREE.MeshStandardMaterial({
      color: 0x8a6a4c,
      roughness: 1,
      map: T.plank || null,
      bumpMap: T.plankBump || null,
      bumpScale: 0.35,
    });
    this.woodDarkMat = new THREE.MeshStandardMaterial({
      color: 0x64492f,
      roughness: 1,
      map: T.plank || null,
      bumpMap: T.plankBump || null,
      bumpScale: 0.35,
    });

    // Seed compartilhável (co-op): mesma geração procedural nos dois clientes
    const rng = createRng(this.seed);
    const prevRandom = Math.random;
    Math.random = rng;
    try {
      this._initLayout();
      this.buildTerrain();
      this.buildIce();
      this.scatterTrees();
      this.scatterRocks();
      this.buildGrass();
      this.buildFlowers();
      this.buildClouds();
      this.buildFireflies();
      this.buildBirds();
      this.buildSnowfall();
      this.buildRainfall();
      this.buildSandstorm();
      this.buildShootingStar();
      this.buildAurora();
      this.buildCampfire();
      this.buildBase();
      this.buildItems();
      this.buildRabbits();
      this.buildEnemies();
      this.buildMinimap();
    } finally {
      Math.random = prevRandom;
    }
  }

  /** Define home/offsets/warp de altura (deve rodar dentro do RNG da seed). */
  _initLayout() {
    if (this.mapMode !== "random") {
      this.home = { x: 0, z: 0 };
      this.campfireOffset = { x: 3, z: 2 };
      this.baseOffset = { x: -4.5, z: -3 };
      this.spawnOffset = { x: 0, z: 0 };
      this.heightWarp = null;
      return;
    }

    this.heightWarp = {
      ox: (Math.random() - 0.5) * 90,
      oz: (Math.random() - 0.5) * 90,
      freq: 0.82 + Math.random() * 0.45,
      ridgeMul: 0.7 + Math.random() * 0.7,
      lakeX: (Math.random() - 0.5) * this.bounds * 0.65,
      lakeZ: (Math.random() - 0.5) * this.bounds * 0.65,
      lakeR: 16 + Math.random() * 26,
      lakeDepth: 1.4 + Math.random() * 2.4,
    };

    let hx = 0;
    let hz = 0;
    let found = false;
    for (let tries = 0; tries < 80; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * (this.bounds * 0.45);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // usa getHeight já com warp
      const h = this.getHeight(x, z);
      if (h < this.waterLevel + 1.2 || h > 8.5) continue;
      if (this.getSlope(x, z) > 0.85) continue;
      // longe do centro do lago
      const dl = Math.hypot(x - this.heightWarp.lakeX, z - this.heightWarp.lakeZ);
      if (dl < this.heightWarp.lakeR + 10) continue;
      hx = x;
      hz = z;
      found = true;
      break;
    }
    if (!found) {
      hx = 12;
      hz = -10;
    }
    this.home = { x: hx, z: hz };
    this.campfireOffset = { x: 2.5 + Math.random() * 1.5, z: 1.5 + Math.random() * 1.5 };
    this.baseOffset = { x: -4.2 - Math.random() * 1.2, z: -2.5 - Math.random() * 1.5 };
    this.spawnOffset = { x: 0.5 + Math.random(), z: 0.5 + Math.random() };
  }

  // ------------------------------------------------------------------
  // TERRENO
  // ------------------------------------------------------------------
  getHeight(x, z) {
    // Relevo periódico no toro: h(x+size)=h(x) com ciclos inteiros —
    // atravessar a costura continua a mesma geografia (sem “salto” de cenário).
    if (!this.inDungeonZone(x, z)) {
      x = this.wrapCoord(x);
      z = this.wrapCoord(z);
    }
    const A = CONFIG.world.amplitude;
    const w = this.heightWarp;
    const s = this.size;
    const TAU = Math.PI * 2;
    // fases / intensidade (mapa aleatório) sem quebrar o período = size
    let phU = 0;
    let phV = 0;
    let ridgeMul = 1;
    let a1 = 0.45;
    let a2 = 0.22;
    let a3 = 0.28;
    let a4 = 0.1;
    if (w) {
      phU = (w.ox / s) * TAU;
      phV = (w.oz / s) * TAU;
      ridgeMul = w.ridgeMul ?? 1;
      const f = w.freq ?? 1;
      a1 *= 0.9 + (f - 0.9) * 0.25;
      a2 *= 0.9 + (f - 0.9) * 0.2;
    }
    const u = (x / s) * TAU;
    const v = (z / s) * TAU;
    let h =
      CONFIG.world.baseHeight +
      Math.sin(u + phU) * Math.cos(v + phV) * A * a1 +
      Math.sin(2 * u + v + phU * 0.7) * A * a2 +
      Math.cos(u - 2 * v + phV) * A * a3 +
      Math.sin(3 * u + 2 * v) * A * a4;
    const ridge = Math.pow(Math.abs(Math.sin(u + phU) * Math.sin(v + phV)), 2.2);
    h += ridge * A * 1.7 * ridgeMul;
    if (w) {
      const dl = this.wrapDistXZ({ x, z }, { x: w.lakeX, z: w.lakeZ });
      if (dl < w.lakeR) {
        const t = 1 - dl / w.lakeR;
        h -= w.lakeDepth * t * t;
      }
    }
    return h;
  }

  /** Variação de cor do terreno alinhada ao período do mapa (sem costura). */
  _terrainShade(x, z) {
    const TAU = Math.PI * 2;
    const u = (x / this.size) * TAU;
    const v = (z / this.size) * TAU;
    return 0.98 + Math.sin(2 * u + 3 * v) * 0.02;
  }

  /** Dentro do "bolso" da dungeon secreta (x≈400)? Chão vira o piso da arena. */
  inDungeonZone(x, z) {
    const d = this.dungeonZone;
    if (!d) return false;
    const dx = x - d.x;
    const dz = z - d.z;
    return dx * dx + dz * dz < d.r * d.r;
  }

  // altura onde se pisa: o gelo cobre o lago
  groundHeight(x, z) {
    if (this.inDungeonZone(x, z)) return this.dungeonZone.floorY;
    return Math.max(this.getHeight(x, z), this.waterLevel);
  }

  isOnIce(x, z) {
    if (this.inDungeonZone(x, z)) return false;
    if (this.getHeight(x, z) >= this.waterLevel) return false;
    // Verão / gelo quase invisível: água sem física de gelo
    const iceOp = this.season?.iceOpacity;
    if (typeof iceOp === "number" && iceOp < 0.35) return false;
    return true;
  }

  getSlope(x, z) {
    const e = 0.6;
    const hx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const hz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  colorAt(x, z, h, out) {
    const c = this._palette || (this._palette = {
      edge: new THREE.Color(CONFIG.colors.iceEdge),
      low: new THREE.Color(CONFIG.colors.snowLow),
      mid: new THREE.Color(CONFIG.colors.snowMid),
      high: new THREE.Color(CONFIG.colors.snowHigh),
      rock: new THREE.Color(CONFIG.colors.rock),
      tint: new THREE.Color(),
    });
    const w = this.waterLevel;
    const t1 = THREE.MathUtils.smoothstep(h, w + 0.2, w + 1.4);
    const t2 = THREE.MathUtils.smoothstep(h, 4.5, 8);
    const t3 = THREE.MathUtils.smoothstep(h, 11.5, 13.5);

    out.copy(c.edge).lerp(c.low, t1);
    out.lerp(c.mid, t2);
    out.lerp(c.high, t3);

    // encostas íngremes mostram rocha exposta
    const steep = THREE.MathUtils.smoothstep(this.getSlope(x, z), 0.8, 1.4);
    out.lerp(c.rock, steep * 0.8);

    // tinta de estação: primavera/verão/outono trocam o "skin" do chão.
    // picos altos ficam nevados o ano todo → reduz a tinta com a altitude.
    const tintMul = this.season?.groundTintMul ?? 0;
    const gt = this.season?.groundTint;
    if (tintMul > 0 && gt != null) {
      if (typeof gt === "number") c.tint.setHex(gt);
      else c.tint.copy(gt);
      out.lerp(c.tint, tintMul * (1 - t3 * 0.85));
    }
    return out;
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, CONFIG.world.segments, CONFIG.world.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const normals = [];
    const col = new THREE.Color();
    // passo ≈ espaçamento do grid (normais wrap-aware = iluminação contínua na costura)
    const e = this.size / CONFIG.world.segments;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);
      this.colorAt(x, z, h, col);
      const v = this._terrainShade(x, z);
      colors.push(col.r * v, col.g * v, col.b * v);
      const hx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
      const hz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
      let nx = -hx / (2 * e);
      let ny = 1;
      let nz = -hz / (2 * e);
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      map: this.tex.snowGround || null,
      bumpMap: this.tex.snowGroundBump || null,
      bumpScale: 0.25,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // 3×3 tiles: o chão continua quando você atravessa a costura (toro visual)
    this.terrainTiles = [this.terrain];
    for (let iz = -1; iz <= 1; iz++) {
      for (let ix = -1; ix <= 1; ix++) {
        if (ix === 0 && iz === 0) continue;
        const tile = new THREE.Mesh(geo, mat);
        tile.receiveShadow = true;
        tile.position.set(ix * this.size, 0, iz * this.size);
        tile.userData.torusIx = ix;
        tile.userData.torusIz = iz;
        this.scene.add(tile);
        this.terrainTiles.push(tile);
      }
    }
    this.terrain.userData.torusIx = 0;
    this.terrain.userData.torusIz = 0;
  }

  buildIce() {
    const geo = new THREE.PlaneGeometry(this.size, this.size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcfe4f2,
      transparent: true,
      opacity: 0.96,
      roughness: 0.12,
      metalness: 0.1,
      map: this.tex.ice || null,
      bumpMap: this.tex.iceBump || null,
      bumpScale: 0.12,
    });
    this.ice = new THREE.Mesh(geo, mat);
    this.ice.position.y = this.waterLevel;
    this.ice.receiveShadow = true;
    this.scene.add(this.ice);

    this.iceTiles = [this.ice];
    for (let iz = -1; iz <= 1; iz++) {
      for (let ix = -1; ix <= 1; ix++) {
        if (ix === 0 && iz === 0) continue;
        const tile = new THREE.Mesh(geo, mat);
        tile.receiveShadow = true;
        tile.position.set(ix * this.size, this.waterLevel, iz * this.size);
        tile.userData.torusIx = ix;
        tile.userData.torusIz = iz;
        this.scene.add(tile);
        this.iceTiles.push(tile);
      }
    }
    this.ice.userData.torusIx = 0;
    this.ice.userData.torusIz = 0;
  }

  /** Centra o grid 3×3 do terreno sob o jogador (células do toro). */
  updateTorusTiles(playerPos) {
    if (!playerPos || this.dungeonActive) return;
    const s = this.size;
    const ox = Math.round(playerPos.x / s) * s;
    const oz = Math.round(playerPos.z / s) * s;
    if (this._torusTileOx === ox && this._torusTileOz === oz) return;
    this._torusTileOx = ox;
    this._torusTileOz = oz;
    for (const tile of this.terrainTiles || []) {
      const ix = tile.userData.torusIx || 0;
      const iz = tile.userData.torusIz || 0;
      tile.position.x = ox + ix * s;
      tile.position.z = oz + iz * s;
    }
    for (const tile of this.iceTiles || []) {
      const ix = tile.userData.torusIx || 0;
      const iz = tile.userData.torusIz || 0;
      tile.position.x = ox + ix * s;
      tile.position.z = oz + iz * s;
      tile.position.y = this.waterLevel;
    }
    for (const tile of this.grassTiles || []) {
      const ix = tile.userData.torusIx || 0;
      const iz = tile.userData.torusIz || 0;
      tile.position.x = ox + ix * s;
      tile.position.z = oz + iz * s;
    }
    for (const tile of this.flowerTiles || []) {
      const ix = tile.userData.torusIx || 0;
      const iz = tile.userData.torusIz || 0;
      tile.position.x = ox + ix * s;
      tile.position.z = oz + iz * s;
    }
  }

  /** Imagem do ponto lógico (lx,lz) mais próxima de (px,pz) no toro. */
  nearestImage(px, pz, lx, lz) {
    const { dx, dz } = this.wrapDelta(px, pz, lx, lz);
    return { x: px + dx, z: pz + dz, dx, dz };
  }

  /** Coloca um objeto na imagem do toro mais próxima do jogador (sem teleporte). */
  presentNearPlayer(obj, lx, lz, ly, playerPos) {
    if (!obj || !playerPos) return;
    const n = this.nearestImage(playerPos.x, playerPos.z, lx, lz);
    obj.position.x = n.x;
    obj.position.z = n.z;
    if (ly != null) obj.position.y = ly;
  }

  /**
   * Antes da IA: meshes voltam às coords lógicas (canônicas).
   * Depois: presentTorusVisuals recoloca tudo ao redor do jogador.
   */
  prepareTorusLogic() {
    if (this.dungeonActive) return;
    for (const e of this.enemies || []) {
      if (!e?.mesh) continue;
      // Montaria sob o jogador: coords contínuas (MountManager) — não rebobinar
      if (e.ridden) continue;
      if (!e._torus) {
        e._torus = { x: this.wrapCoord(e.mesh.position.x), z: this.wrapCoord(e.mesh.position.z) };
      }
      e.mesh.position.x = e._torus.x;
      e.mesh.position.z = e._torus.z;
    }
    for (const r of this.rabbits || []) {
      if (!r) continue;
      if (!r.userData._torus) {
        r.userData._torus = { x: this.wrapCoord(r.position.x), z: this.wrapCoord(r.position.z) };
      }
      r.position.x = r.userData._torus.x;
      r.position.z = r.userData._torus.z;
    }
  }

  presentTorusVisuals(playerPos) {
    if (!playerPos || this.dungeonActive) return;
    this.updateTorusTiles(playerPos);

    for (const e of this.enemies || []) {
      if (!e?.mesh) continue;
      // Montado: já está ao lado do jogador em coords contínuas
      if (e.ridden) {
        e._torus = {
          x: this.wrapCoord(e.mesh.position.x),
          z: this.wrapCoord(e.mesh.position.z),
        };
        continue;
      }
      const lx = this.wrapCoord(e.mesh.position.x);
      const lz = this.wrapCoord(e.mesh.position.z);
      e._torus = { x: lx, z: lz };
      this.presentNearPlayer(e.mesh, lx, lz, e.mesh.position.y, playerPos);
    }

    for (const r of this.rabbits || []) {
      if (!r) continue;
      const lx = this.wrapCoord(r.position.x);
      const lz = this.wrapCoord(r.position.z);
      r.userData._torus = { x: lx, z: lz };
      this.presentNearPlayer(r, lx, lz, r.position.y, playerPos);
    }

    for (const t of this.trees || []) {
      const lx = t.userData.homeX ?? t.position.x;
      const lz = t.userData.homeZ ?? t.position.z;
      t.userData.homeX = lx;
      t.userData.homeZ = lz;
      this.presentNearPlayer(t, lx, lz, t.position.y, playerPos);
    }

    for (const c of this.colliders || []) {
      if (!c.mesh || c.temporary) continue;
      this.presentNearPlayer(c.mesh, c.x, c.z, c.mesh.position.y, playerPos);
    }

    for (const it of this.items || []) {
      if (!it?.mesh || it.collected) continue;
      const lx = it.pos?.x ?? it.mesh.position.x;
      const lz = it.pos?.z ?? it.mesh.position.z;
      const ly = this.groundHeight(lx, lz) + 0.18;
      it.mesh.visible = true;
      this.presentNearPlayer(it.mesh, lx, lz, ly, playerPos);
    }

    if (this.campfire && this.campfirePos) {
      this.presentNearPlayer(
        this.campfire,
        this.campfirePos.x,
        this.campfirePos.z,
        this.campfire.position.y,
        playerPos
      );
    }
    if (this.baseGroup && this.basePos) {
      this.presentNearPlayer(
        this.baseGroup,
        this.basePos.x,
        this.basePos.z,
        this.baseGroup.position.y,
        playerPos
      );
    }

    for (const t of this.placedTraps || []) {
      if (!t?.alive || !t.mesh) continue;
      const lx = t.pos?.x ?? t.mesh.position.x;
      const lz = t.pos?.z ?? t.mesh.position.z;
      this.presentNearPlayer(t.mesh, lx, lz, t.mesh.position.y, playerPos);
    }
  }

  // ------------------------------------------------------------------
  // VEGETAÇÃO E PEDRAS
  // ------------------------------------------------------------------
  makeTree(x, z) {
    const g = new THREE.Group();
    const leafMat = this.leafMats[(Math.random() * this.leafMats.length) | 0];
    const trunkH = 2 + Math.random() * 1.6;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, trunkH, 7), this.trunkMat);
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // Copa separada do tronco (Spirit): vento/chuva mexem nas folhas, não na árvore inteira
    const canopyRoot = new THREE.Group();
    canopyRoot.position.y = 0;
    g.add(canopyRoot);

    // pinheiro com neve acumulada em cada camada
    let canopyTop = trunkH;
    let canopyR = 1.5;
    for (let k = 0; k < 3; k++) {
      const r = 1.5 - k * 0.32;
      canopyR = Math.max(canopyR, r);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.7, 8), leafMat);
      cone.position.y = trunkH + k * 0.95;
      canopyRoot.add(cone);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, 0.5, 8), this.snowCapMat);
      cap.position.y = trunkH + k * 0.95 + 0.62;
      canopyRoot.add(cap);
      canopyTop = trunkH + k * 0.95 + 0.85;
    }

    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    const h = this.getHeight(x, z);
    const s = 0.8 + Math.random() * 0.9;
    g.position.set(x, h, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    g.scale.setScalar(s);
    g.userData.phase = Math.random() * Math.PI * 2;
    g.userData.homeX = x;
    g.userData.homeZ = z;
    g.userData.canopyRoot = canopyRoot;
    g.userData.canopyR = canopyR * s;
    g.userData.canopyTop = canopyTop * s;
    g.userData.canopyBot = trunkH * s * 0.85;
    g.userData.trunkBaseY = trunkH;
    this.scene.add(g);
    this.trees.push(g);
    // r = tronco (movimento); coverR maior = copa/tronco bloqueiam tiros
    this.colliders.push({
      x,
      z,
      y: h,
      r: 0.35 * s,
      coverR: Math.max(0.75, 0.95 * s),
      top: h + trunkH * s + 3.2,
      climbable: false,
      cover: true,
    });
  }

  /**
   * Bioma local do mapa (influencia densidade de árvores):
   * - clareira: perto da base
   * - floresta: anéis densos
   * - montanha: altitude alta, menos árvores / mais pedras
   * - neve: restante
   */
  biomeAt(x, z) {
    const hx = this.home?.x ?? 0;
    const hz = this.home?.z ?? 0;
    const dist = this.wrapDistXZ({ x, z }, { x: hx, z: hz });
    if (dist < 14) return "clareira";
    const h = this.getHeight(x, z);
    if (h > 7.2) return "montanha";
    // manchas de floresta periódicas (mesmo padrão após dar a volta no mapa)
    const TAU = Math.PI * 2;
    const u = (x / this.size) * TAU;
    const v = (z / this.size) * TAU;
    const a = Math.sin(2 * u) * Math.cos(2 * v);
    if (a > 0.35 && dist > 22 && dist < this.half * 0.9) return "floresta";
    return "neve";
  }

  scatterTrees() {
    let placed = 0;
    let tries = 0;
    const target = CONFIG.world.treeCount;
    // quase até a borda do período — a floresta continua pela costura do toro
    const lim = this.half - 0.75;
    while (placed < target && tries < target * 16) {
      tries++;
      const x = (Math.random() * 2 - 1) * lim;
      const z = (Math.random() * 2 - 1) * lim;
      const h = this.getHeight(x, z);
      if (h < this.waterLevel + 0.9 || h > 9.5) continue;
      const hx = this.home?.x ?? 0;
      const hz = this.home?.z ?? 0;
      if (this.wrapDistXZ({ x, z }, { x: hx, z: hz }) < 9) continue; // clareira da base
      const biome = this.biomeAt(x, z);
      // densidades relativas
      if (biome === "montanha" && Math.random() > 0.35) continue;
      if (biome === "neve" && Math.random() > 0.55) continue;
      if (biome === "floresta") {
        this.makeTree(x, z);
        placed++;
        // cluster extra na floresta
        if (placed < target && Math.random() < 0.55) {
          const ox = x + (Math.random() - 0.5) * 4;
          const oz = z + (Math.random() - 0.5) * 4;
          const oh = this.getHeight(ox, oz);
          if (
            Math.abs(ox) < lim &&
            Math.abs(oz) < lim &&
            oh >= this.waterLevel + 0.9 &&
            oh <= 9.5 &&
            this.wrapDistXZ({ x: ox, z: oz }, { x: hx, z: hz }) > 9
          ) {
            this.makeTree(ox, oz);
            placed++;
          }
        }
        continue;
      }
      this.makeTree(x, z);
      placed++;
    }
  }

  scatterRocks() {
    const lim = this.half - 0.75;
    for (let i = 0; i < CONFIG.world.rockCount; i++) {
      const x = (Math.random() * 2 - 1) * lim;
      const z = (Math.random() * 2 - 1) * lim;
      const h = this.getHeight(x, z);
      if (
        h < this.waterLevel + 0.3 ||
        this.wrapDistXZ({ x, z }, { x: this.home?.x ?? 0, z: this.home?.z ?? 0 }) < 9
      )
        continue;
      const r = 0.5 + Math.random() * 1.7;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), this.rockMat);
      const cy = h + r * 0.25;
      rock.position.set(x, cy, z);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.scale.y = 0.7;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      // topo andável ≈ centro + raio vertical (scale.y 0.7)
      const top = cy + r * 0.7;
      this.colliders.push({
        x,
        z,
        y: h,
        r: Math.max(0.45, r * 0.72),
        coverR: Math.max(0.55, r * 0.9),
        top,
        climbable: true,
        cover: true,
        mesh: rock,
      });
    }
  }

  buildGrass() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.grassCount ?? Math.min(900, CONFIG.world.grassCount)
      : CONFIG.world.grassCount;
    const tuft = new THREE.BufferGeometry();
    const w = 0.26;
    const h = 0.5;
    const verts = new Float32Array([
      -w, 0, 0, w, 0, 0, 0, h, 0,
      0, 0, -w, 0, 0, w, 0, h, 0,
    ]);
    const colors = new Float32Array([
      0.55, 0.52, 0.42, 0.55, 0.52, 0.42, 0.75, 0.72, 0.6,
      0.55, 0.52, 0.42, 0.55, 0.52, 0.42, 0.75, 0.72, 0.6,
    ]);
    tuft.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    tuft.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    tuft.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWind = { value: 1 };
      shader.vertexShader = "uniform float uTime;\nuniform float uWind;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        float wind = sin(uTime * 1.9 + transformed.x * 0.35 + transformed.z * 0.28) * 0.14 * uWind;
        transformed.x += wind * (position.y * 1.8);
        `
      );
      mat.userData.shader = shader;
    };
    this.grassMat = mat;
    const grass = new THREE.InstancedMesh(tuft, mat, count);

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const lim = this.half - 0.75;
    let i = 0;
    let tries = 0;
    while (i < count && tries < count * 8) {
      tries++;
      const x = (Math.random() * 2 - 1) * lim;
      const z = (Math.random() * 2 - 1) * lim;
      const y = this.getHeight(x, z);
      if (y < this.waterLevel + 0.7 || y > 9.5) continue;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      const s = 0.7 + Math.random() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      col.setHex(0xb9a86c).multiplyScalar(0.8 + Math.random() * 0.35);
      grass.setColorAt(i, col);
      i++;
    }
    grass.count = i;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.grass = grass;
    this.scene.add(grass);

    // 3×3: grama continua pela costura (sem “pop” ao trocar de célula)
    this.grassTiles = [grass];
    grass.userData.torusIx = 0;
    grass.userData.torusIz = 0;
    for (let iz = -1; iz <= 1; iz++) {
      for (let ix = -1; ix <= 1; ix++) {
        if (ix === 0 && iz === 0) continue;
        const tile = grass.clone();
        tile.position.set(ix * this.size, 0, iz * this.size);
        tile.userData.torusIx = ix;
        tile.userData.torusIz = iz;
        this.scene.add(tile);
        this.grassTiles.push(tile);
      }
    }
  }

  /** Flores da primavera (e um pouco no verão) — InstancedMesh leve, sem colisão. */
  buildFlowers() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.flowerCount ?? Math.min(180, CONFIG.world.flowerCount ?? 420)
      : CONFIG.world.flowerCount ?? 420;
    const petal = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -0.12, 0.02, 0, 0.12, 0.02, 0, 0, 0.28, 0,
      0, 0.02, -0.12, 0, 0.02, 0.12, 0, 0.28, 0,
    ]);
    petal.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    petal.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.flowerMat = mat;
    const mesh = new THREE.InstancedMesh(petal, mat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const palette = [0xff6b8a, 0xffc857, 0xc77dff, 0xff8c42, 0x7ec8ff, 0xffffff];
    const lim = this.half - 0.75;
    let i = 0;
    let tries = 0;
    while (i < count && tries < count * 10) {
      tries++;
      const x = (Math.random() * 2 - 1) * lim;
      const z = (Math.random() * 2 - 1) * lim;
      const y = this.getHeight(x, z);
      if (y < this.waterLevel + 0.85 || y > 8.5) continue;
      if (this.wrapDistXZ({ x, z }, { x: this.home?.x ?? 0, z: this.home?.z ?? 0 }) < 6) continue;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
      const s = 0.65 + Math.random() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.setHex(palette[(Math.random() * palette.length) | 0]);
      mesh.setColorAt(i, col);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = false;
    this.flowers = mesh;
    this.scene.add(mesh);
    this.flowerTiles = [mesh];
    mesh.userData.torusIx = 0;
    mesh.userData.torusIz = 0;
    for (let iz = -1; iz <= 1; iz++) {
      for (let ix = -1; ix <= 1; ix++) {
        if (ix === 0 && iz === 0) continue;
        const tile = mesh.clone();
        tile.position.set(ix * this.size, 0, iz * this.size);
        tile.userData.torusIx = ix;
        tile.userData.torusIz = iz;
        tile.visible = false;
        this.scene.add(tile);
        this.flowerTiles.push(tile);
      }
    }
  }

  /** Chuva: traços curtos ao redor da câmera (visível mesmo com névoa). */
  buildRainfall() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.rainCount ?? 280
      : CONFIG.world.rainCount ?? 720;
    // 2 vértices por gota → LineSegments (não some na névoa como Points minúsculos)
    const positions = new Float32Array(count * 2 * 3);
    this.rainData = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * 22;
      const y = 6 + Math.random() * 16;
      const z = (Math.random() * 2 - 1) * 22;
      const len = 0.45 + Math.random() * 0.55;
      positions.set([x, y, z, x, y - len, z], i * 6);
      this.rainData.push({
        speed: 16 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        len,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xd0e4f8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 3;
    this.scene.add(this.rain);
    this._rainAmt = 0;
  }

  /** Areia / poeira de tempestade (verão). */
  buildSandstorm() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.sandCount ?? 200
      : CONFIG.world.sandCount ?? 480;
    const positions = new Float32Array(count * 3);
    this.sandData = [];
    for (let i = 0; i < count; i++) {
      positions.set(
        [(Math.random() * 2 - 1) * 42, 1 + Math.random() * 12, (Math.random() * 2 - 1) * 42],
        i * 3
      );
      this.sandData.push({
        speed: 6 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        lift: 0.4 + Math.random() * 0.8,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.sand = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd2a86a,
        size: this.lowFx ? 0.22 : 0.16,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.sand.visible = false;
    this.scene.add(this.sand);
    this._sandAmt = 0;
  }

  /** Intensidades de clima vindas do Game (estação + eventos). */
  setWeather(wx) {
    this._weather = wx || { rain: 0, sand: 0, wind: 1, snowBoost: 0 };
    this._rainAmt = this._weather.rain || 0;
    this._sandAmt = this._weather.sand || 0;
    this._windAmt = this._weather.wind || 1;
  }

  // ------------------------------------------------------------------
  // CÉU E CLIMA
  // ------------------------------------------------------------------
  buildClouds() {
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      roughness: 1,
      fog: false,
    });
    this.clouds = [];
    for (let i = 0; i < CONFIG.world.cloudCount; i++) {
      const cloud = new THREE.Group();
      const puffs = 5 + ((Math.random() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        const r = 5 + Math.random() * 7;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), this.cloudMat);
        puff.position.set((p - puffs / 2) * r * 0.7, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 7);
        puff.scale.set(1 + Math.random() * 0.4, 0.32 + Math.random() * 0.15, 0.9 + Math.random() * 0.3);
        cloud.add(puff);
      }
      cloud.position.set(
        (Math.random() * 2 - 1) * this.half * 1.4,
        55 + Math.random() * 25,
        (Math.random() * 2 - 1) * this.half * 1.4
      );
      cloud.userData.speed = 1.0 + Math.random() * 1.4;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  buildFireflies() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.fireflyCount ?? Math.min(28, CONFIG.world.fireflyCount)
      : CONFIG.world.fireflyCount;
    const positions = new Float32Array(count * 3);
    this.fireflyBase = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * this.bounds;
      const z = (Math.random() * 2 - 1) * this.bounds;
      const h = this.getHeight(x, z);
      const y = Math.max(h, this.waterLevel) + 0.5 + Math.random() * 1.6;
      positions.set([x, y, z], i * 3);
      this.fireflyBase.push({ x, y, z, phase: Math.random() * Math.PI * 2 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      color: 0xbfe8ff,
      size: 0.32,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.scene.add(this.fireflies);
  }

  buildBirds() {
    this.birds = [];
    const wingGeo = new THREE.PlaneGeometry(0.9, 0.28);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1c1c22, side: THREE.DoubleSide });
    for (let i = 0; i < CONFIG.world.birdCount; i++) {
      const bird = new THREE.Group();
      const left = new THREE.Mesh(wingGeo, mat);
      left.position.x = -0.45;
      const right = new THREE.Mesh(wingGeo, mat);
      right.position.x = 0.45;
      bird.add(left, right);
      bird.userData = {
        left,
        right,
        angle: Math.random() * Math.PI * 2,
        radius: 25 + Math.random() * 45,
        height: 26 + Math.random() * 14,
        speed: 0.15 + Math.random() * 0.12,
        flapPhase: Math.random() * 10,
      };
      this.scene.add(bird);
      this.birds.push(bird);
    }
  }

  // nevasca: flocos reciclados ao redor do jogador
  buildSnowfall() {
    const count = this.lowFx
      ? CONFIG.mobileGfx?.snowCount ?? Math.min(320, CONFIG.world.snowCount)
      : CONFIG.world.snowCount;
    const positions = new Float32Array(count * 3);
    this.snowData = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * 40;
      const z = (Math.random() * 2 - 1) * 40;
      const y = 2 + Math.random() * 20;
      positions.set([x, y, z], i * 3);
      this.snowData.push({ speed: 1.6 + Math.random() * 2.2, phase: Math.random() * Math.PI * 2 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.snow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.lowFx ? 0.18 : 0.14,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    this.scene.add(this.snow);
  }

  /**
   * Aplica o visual da estação. `season` pode ser um estado *interpolado*
   * (transição gradual) — os campos caros (vertex-colors do terreno + minimapa)
   * só recalculam quando `recolorTerrain` é true (main throttle isso).
   */
  applySeason(season, { recolorTerrain = true } = {}) {
    if (!season) return;
    this.season = season;
    const snowMul = season.snowMul ?? 1;
    if (this.ice?.material) {
      this.ice.material.opacity = season.iceOpacity ?? 0.96;
      if (season.iceColor != null) {
        // iceColor pode vir como número (hex) ou THREE.Color já interpolado
        if (typeof season.iceColor === "number") this.ice.material.color.setHex(season.iceColor);
        else this.ice.material.color.copy(season.iceColor);
      }
      this.ice.material.transparent = true;
      this.ice.material.needsUpdate = true;
    }
    if (this.snow?.material) {
      this.snow.visible = snowMul > 0.04;
      this.snow.material.opacity = Math.max(0.08, 0.9 * snowMul);
    }
    // flores: primavera forte, verão suave, inverno some
    const flowerMul = season.flowerMul ?? 0;
    if (this.flowerTiles) {
      const show = flowerMul > 0.12;
      for (const t of this.flowerTiles) {
        t.visible = show;
        if (t.material) t.material.opacity = Math.min(1, 0.35 + flowerMul * 0.7);
      }
    }
    // caps de neve (árvores + telhado) surgem/somem gradualmente com a neve
    const showCaps = snowMul > 0.45;
    if (showCaps !== this._capsShown) {
      this._capsShown = showCaps;
      if (this.trees) {
        for (const tree of this.trees) {
          tree.traverse((m) => {
            if (m.isMesh && m.material === this.snowCapMat) m.visible = showCaps;
          });
        }
      }
      for (const cap of this.snowCaps || []) {
        if (cap) cap.visible = showCaps;
      }
    }

    // "skin" do mundo por estação: folhas e grama (barato — todo frame ok)
    this.recolorVegetation(season);
    if (recolorTerrain) this.recolorTerrain();
  }

  /** Tinta como número (hex) ou THREE.Color já interpolado. */
  _asColor(tint, tmp) {
    if (tint == null) return null;
    if (typeof tint === "number") return tmp.setHex(tint);
    return tmp.copy(tint);
  }

  /** Tinge folhas dos pinheiros e a grama conforme a estação. */
  recolorVegetation(season) {
    const tmp = this._seasonTmpColor || (this._seasonTmpColor = new THREE.Color());
    const leafMul = season.leafTintMul ?? 0;
    const leafTint = this._asColor(season.leafTint, tmp);
    if (this.leafMats && this._leafBase) {
      for (let i = 0; i < this.leafMats.length; i++) {
        const mat = this.leafMats[i];
        mat.color.setHex(this._leafBase[i]);
        if (leafMul > 0 && leafTint) mat.color.lerp(leafTint, leafMul);
        mat.needsUpdate = true;
      }
    }
    if (this.grassMat) {
      const grassMul = season.grassTintMul ?? 0;
      const grassTint = this._asColor(season.grassTint, tmp);
      this.grassMat.color.setHex(0xffffff);
      if (grassMul > 0 && grassTint) this.grassMat.color.lerp(grassTint, grassMul);
      this.grassMat.needsUpdate = true;
    }
  }

  /** Recalcula as vertex-colors do terreno (chão muda de cor por estação). */
  recolorTerrain() {
    if (!this.terrain?.geometry) return;
    const geo = this.terrain.geometry;
    const pos = geo.attributes.position;
    const colAttr = geo.attributes.color;
    if (!pos || !colAttr) return;
    const col = this._seasonTmpColor2 || (this._seasonTmpColor2 = new THREE.Color());
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = pos.getY(i);
      this.colorAt(x, z, h, col);
      const v = this._terrainShade(x, z);
      colAttr.setXYZ(i, col.r * v, col.g * v, col.b * v);
    }
    colAttr.needsUpdate = true;

    // Desktop: o albedo `snowGround` é quase branco e o bloom/sombras
    // mascaram só as vertex-colors — tingir material.color deixa verão/outono
    // legíveis sem trocar de textura.
    const mat = this.terrain.material;
    if (mat) {
      const tintMul = this.season?.groundTintMul ?? 0;
      const gt = this._asColor(this.season?.groundTint, col);
      if (tintMul > 0.01 && gt) {
        mat.color.setRGB(
          THREE.MathUtils.lerp(1, gt.r, tintMul * 0.9),
          THREE.MathUtils.lerp(1, gt.g, tintMul * 0.9),
          THREE.MathUtils.lerp(1, gt.b, tintMul * 0.9)
        );
      } else {
        mat.color.setHex(0xffffff);
      }
      mat.needsUpdate = true;
    }

    // minimapa usa a mesma paleta → regenera com a nova estação
    this.buildMinimap();
  }

  updateSnowfall(dt, elapsed, playerPos) {
    const p = playerPos || { x: 0, y: 4, z: 0 };
    let snowMul = this.season?.snowMul ?? 1;
    if (this._weather?.snowBoost) snowMul = Math.max(snowMul, 0.95);
    if (snowMul < 0.04 || !this.snow) return;
    // Nunca chamar groundHeight por floco — 1400×/frame travava o desktop (~segundos)
    const skip = this.lowFx
      ? CONFIG.mobileGfx?.snowFrameSkip ?? 2
      : CONFIG.world.snowFrameSkip ?? 2;
    this._snowFrame = ((this._snowFrame || 0) + 1) % skip;
    if (this._snowFrame !== 0) return;
    dt *= skip;
    const sp = this.snow.geometry.attributes.position;
    const blizzard = this.season?.blizzardMul ?? 1;
    const wind = this._windAmt ?? 1;
    const speedMul = (0.35 + snowMul * 0.9) * blizzard;
    const floorY = (p.y || 4) - 1.5;
    const n = Math.min(this.snowData.length, this._snowPerfCap || this.snowData.length);
    for (let i = 0; i < n; i++) {
      const d = this.snowData[i];
      let x = sp.getX(i) + Math.sin(elapsed * 1.1 + d.phase) * dt * 0.8 * snowMul * wind;
      let y = sp.getY(i) - d.speed * dt * speedMul;
      let z = sp.getZ(i) + Math.cos(elapsed * 0.9 + d.phase) * dt * 0.5 * snowMul * wind;
      const dx = x - p.x;
      const dz = z - p.z;
      if (y < floorY || dx * dx + dz * dz > 45 * 45) {
        x = p.x + (Math.random() * 2 - 1) * 40;
        z = p.z + (Math.random() * 2 - 1) * 40;
        y = p.y + 10 + Math.random() * 14;
      }
      sp.setXYZ(i, x, y, z);
    }
    sp.needsUpdate = true;
  }

  updateRainfall(dt, elapsed, playerPos) {
    const amt = this._rainAmt || 0;
    if (!this.rain) return;
    if (amt < 0.05) {
      this.rain.visible = false;
      if (this.rain.material) this.rain.material.opacity = 0;
      return;
    }
    this.rain.visible = true;
    // garoa já dá pra ver; tempestade fica densa
    this.rain.material.opacity = Math.min(0.9, 0.35 + amt * 0.55);
    const skip = this.lowFx ? 2 : 1;
    this._rainFrame = ((this._rainFrame || 0) + 1) % skip;
    if (this._rainFrame !== 0) return;
    dt *= skip;
    const p = playerPos || { x: 0, y: 4, z: 0 };
    const sp = this.rain.geometry.attributes.position;
    const wind = this._windAmt ?? 1;
    const n = this.rainData.length;
    const floorY = (p.y || 4) - 0.6;
    const radius = this.lowFx ? 20 : 26;
    const windLean = wind * 0.12;
    for (let i = 0; i < n; i++) {
      const d = this.rainData[i];
      // ponta de cima da gota (vértice par)
      let x = sp.getX(i * 2) + wind * dt * 3.2;
      let y = sp.getY(i * 2) - d.speed * dt * (0.85 + amt * 0.6);
      let z = sp.getZ(i * 2) + Math.sin(elapsed * 1.2 + d.phase) * dt * 0.55 * wind;
      const dx = x - p.x;
      const dz = z - p.z;
      if (y < floorY || dx * dx + dz * dz > radius * radius) {
        x = p.x + (Math.random() * 2 - 1) * radius * 0.92;
        z = p.z + (Math.random() * 2 - 1) * radius * 0.92;
        y = (p.y || 4) + 7 + Math.random() * 12;
      }
      const len = d.len * (0.85 + amt * 0.55);
      sp.setXYZ(i * 2, x, y, z);
      sp.setXYZ(i * 2 + 1, x - windLean, y - len, z);
    }
    sp.needsUpdate = true;
  }

  updateSandstorm(dt, elapsed, playerPos) {
    const amt = this._sandAmt || 0;
    if (!this.sand) return;
    if (amt < 0.05) {
      this.sand.visible = false;
      if (this.sand.material) this.sand.material.opacity = 0;
      return;
    }
    this.sand.visible = true;
    this.sand.material.opacity = Math.min(0.9, 0.2 + amt * 0.65);
    const skip = this.lowFx ? 2 : 1;
    this._sandFrame = ((this._sandFrame || 0) + 1) % skip;
    if (this._sandFrame !== 0) return;
    dt *= skip;
    const p = playerPos || { x: 0, y: 4, z: 0 };
    const sp = this.sand.geometry.attributes.position;
    const wind = this._windAmt ?? 1;
    const n = this.sandData.length;
    for (let i = 0; i < n; i++) {
      const d = this.sandData[i];
      let x = sp.getX(i) + d.speed * dt * wind * (0.8 + amt);
      let y = sp.getY(i) + Math.sin(elapsed * 2 + d.phase) * dt * d.lift;
      let z = sp.getZ(i) + Math.cos(elapsed * 1.4 + d.phase) * dt * 1.6 * wind;
      const dx = x - p.x;
      const dz = z - p.z;
      if (y < (p.y || 4) - 2 || y > (p.y || 4) + 14 || dx * dx + dz * dz > 48 * 48) {
        x = p.x + (Math.random() * 2 - 1) * 40;
        z = p.z + (Math.random() * 2 - 1) * 40;
        y = p.y + Math.random() * 10;
      }
      sp.setXYZ(i, x, y, z);
    }
    sp.needsUpdate = true;
  }

  buildShootingStar() {
    this.shootMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.shootingStar = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.3), this.shootMat);
    this.scene.add(this.shootingStar);
    this.shootDir = new THREE.Vector3(1, -0.3, 0);
    this.shootTimer = 6;
    this.shootActive = 0;
    this._xAxis = new THREE.Vector3(1, 0, 0);
  }

  updateShootingStar(dt, night) {
    if (night < 0.5) {
      this.shootMat.opacity = 0;
      this.shootActive = 0;
      return;
    }
    if (this.shootActive > 0) {
      this.shootActive -= dt;
      this.shootingStar.position.addScaledVector(this.shootDir, dt * 140);
      this.shootMat.opacity = Math.max(0, Math.min(1, this.shootActive * 2)) * night;
    } else {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = 6 + Math.random() * 10;
        this.shootActive = 1;
        this.shootingStar.position.set(
          (Math.random() * 2 - 1) * this.half,
          85 + Math.random() * 40,
          (Math.random() * 2 - 1) * this.half
        );
        this.shootDir
          .set(0.7 + Math.random() * 0.3, -0.3 - Math.random() * 0.2, (Math.random() - 0.5) * 0.8)
          .normalize();
        if (Math.random() < 0.5) this.shootDir.x *= -1;
        this.shootingStar.quaternion.setFromUnitVectors(this._xAxis, this.shootDir);
      }
    }
  }

  // ------------------------------------------------------------------
  // AURORA BOREAL + presente de gelo (surpresa noturna)
  // ------------------------------------------------------------------
  buildAurora() {
    this.auroraGroup = new THREE.Group();
    this.auroraIntensity = 0;
    this.auroraTarget = 0;
    this.auroraAnnounced = false;
    this.auroraGiftDropped = false;
    this.auroraGift = null;
    this.auroraLight = new THREE.PointLight(0x66ffaa, 0, 90, 2);
    this.auroraLight.position.set(0, 40, 0);
    this.scene.add(this.auroraLight);

    const curtainShader = {
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uHue: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uHue;
        varying vec2 vUv;
        void main() {
          float x = vUv.x;
          float y = vUv.y;
          float w1 = sin(x * 14.0 + uTime * 0.55 + uHue);
          float w2 = sin(x * 6.5 - uTime * 0.32 + uHue * 2.0);
          float band = pow(max(0.0, w1 * 0.55 + w2 * 0.45), 2.2);
          float curtain = band * smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.35, y);
          curtain *= 0.55 + 0.45 * sin(y * 18.0 + uTime * 1.2 + x * 4.0);
          vec3 green = vec3(0.15, 0.95, 0.45);
          vec3 cyan = vec3(0.2, 0.75, 1.0);
          vec3 magenta = vec3(0.75, 0.25, 1.0);
          float mixA = 0.5 + 0.5 * sin(x * 3.0 + uTime * 0.2 + uHue);
          vec3 col = mix(green, cyan, mixA);
          col = mix(col, magenta, 0.25 + 0.25 * sin(uTime * 0.15 + uHue));
          col *= 0.65 + y * 0.55;
          gl_FragColor = vec4(col, curtain * uOpacity);
        }
      `,
    };

    this.auroraMats = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: curtainShader.uniforms.uTime,
          uOpacity: { value: 0 },
          uHue: { value: i * 0.9 },
        },
        vertexShader: curtainShader.vertexShader,
        fragmentShader: curtainShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(110, 55, 1, 1), mat);
      const ang = -0.9 + i * 0.45;
      mesh.position.set(Math.sin(ang) * 70, 48, -Math.cos(ang) * 55);
      mesh.rotation.y = ang;
      mesh.rotation.x = -0.12;
      this.auroraGroup.add(mesh);
      this.auroraMats.push(mat);
    }
    this.scene.add(this.auroraGroup);

    // cristal de gelo (presente)
    const giftMat = new THREE.MeshBasicMaterial({
      color: 0xa8fff0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const gift = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), giftMat);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x66ffcc,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    gift.add(core, ring);
    gift.visible = false;
    gift.userData = { vy: 0, grounded: false, ring };
    this.scene.add(gift);
    this.auroraGift = gift;
    this._auroraTimeUniform = curtainShader.uniforms.uTime;
  }

  updateAurora(dt, elapsed, night, playerPos) {
    // só no meio da noite
    const deep = THREE.MathUtils.smoothstep(night, 0.55, 0.9);
    if (deep < 0.08) {
      this.auroraTarget = 0;
      this.auroraAnnounced = false;
      this.auroraGiftDropped = false;
      this.auroraCooldown = null;
      if (this.auroraGift && !this.auroraGift.userData.landed) this.auroraGift.visible = false;
    } else if (!this.auroraAnnounced) {
      if (this.auroraCooldown == null) this.auroraCooldown = 3 + Math.random() * 7;
      this.auroraCooldown -= dt;
      if (this.auroraCooldown <= 0) {
        this.auroraTarget = 0.8 + Math.random() * 0.2;
        this.auroraAnnounced = true;
        this.onAurora?.("start");
      }
    }

    this.auroraIntensity += (this.auroraTarget - this.auroraIntensity) * Math.min(1, dt * 0.6);
    const a = this.auroraIntensity * deep;

    if (this._auroraTimeUniform) this._auroraTimeUniform.value = elapsed;
    for (const mat of this.auroraMats) {
      mat.uniforms.uOpacity.value = a * 0.85;
    }
    this.auroraGroup.position.x = playerPos.x;
    this.auroraGroup.position.z = playerPos.z;
    this.auroraGroup.rotation.y = elapsed * 0.02;
    this.auroraLight.intensity = a * 1.4;
    this.auroraLight.position.set(playerPos.x, playerPos.y + 35, playerPos.z - 20);

    // presente cai uma vez por aurora
    const g = this.auroraGift;
    if (!g) return a;
    if (a > 0.55 && !this.auroraGiftDropped && this.auroraAnnounced) {
      this.auroraGiftDropped = true;
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 10;
      g.position.set(
        playerPos.x + Math.cos(ang) * dist,
        playerPos.y + 55,
        playerPos.z + Math.sin(ang) * dist
      );
      g.userData.vy = 0;
      g.userData.landed = false;
      g.visible = true;
    }

    if (g.visible && !g.userData.landed) {
      g.userData.vy -= 18 * dt;
      g.position.y += g.userData.vy * dt;
      const ground = this.groundHeight(g.position.x, g.position.z) + 0.6;
      if (g.position.y <= ground) {
        g.position.y = ground;
        g.userData.vy = 0;
        g.userData.landed = true;
        this.onAurora?.("gift");
      }
    }
    if (g.visible) {
      g.rotation.y += dt * 1.8;
      if (g.userData.ring) g.userData.ring.rotation.z += dt * 2.2;
      const pulse = 0.85 + Math.sin(elapsed * 4) * 0.15;
      g.scale.setScalar(pulse);
    }
    return a;
  }

  /** Pega o cristal de gelo se o jogador estiver perto. Retorna true se coletou. */
  tryCollectAuroraGift(playerPos) {
    const g = this.auroraGift;
    if (!g?.visible || !g.userData.landed) return false;
    if (this.wrapDistXZ(playerPos, g.position) > 2.8) return false;
    g.visible = false;
    return true;
  }

  // ------------------------------------------------------------------
  // BASE (fogueira + cabana + baú)
  // ------------------------------------------------------------------
  buildCampfire() {
    const g = new THREE.Group();
    const fx = (this.home?.x ?? 0) + (this.campfireOffset?.x ?? 3);
    const fz = (this.home?.z ?? 0) + (this.campfireOffset?.z ?? 2);
    const fy = this.getHeight(fx, fz);
    g.position.set(fx, fy, fz);
    this.campfirePos = g.position.clone();

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), this.rockMat);
      stone.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
      stone.castShadow = true;
      g.add(stone);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.75, 6), this.trunkMat);
      log.position.set(Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16);
      log.rotation.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
      log.castShadow = true;
      g.add(log);
    }

    this.flames = [];
    const flameColors = [0xffcf5a, 0xff8a2a, 0xff5a1a];
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.16 - i * 0.035, 0.55 - i * 0.1, 7),
        new THREE.MeshBasicMaterial({
          color: flameColors[i],
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      flame.position.set((i - 1) * 0.07, 0.45 + i * 0.08, (i - 1) * 0.05);
      this.flames.push(flame);
      g.add(flame);
    }

    this.fireLight = new THREE.PointLight(0xff7a30, 1.2, 12, 1.6);
    this.fireLight.position.set(0, 0.7, 0);
    g.add(this.fireLight);

    const smokeCount = 18;
    const smokePos = new Float32Array(smokeCount * 3);
    this.smokeData = [];
    for (let i = 0; i < smokeCount; i++) {
      const y = 0.8 + Math.random() * 2.6;
      smokePos.set([0, y, 0], i * 3);
      this.smokeData.push({ y, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.4 });
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    this.smoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({ color: 0x9a9a9a, size: 0.28, transparent: true, opacity: 0.3, depthWrite: false })
    );
    g.add(this.smoke);

    this.campfire = g;
    this.scene.add(g);
    // fogueira: dá para subir nas pedras do fogo
    this.colliders.push({ x: fx, z: fz, y: fy, r: 0.7, top: fy + 0.55, climbable: true });
  }

  buildBase() {
    const bx = (this.home?.x ?? 0) + (this.baseOffset?.x ?? -4.5);
    const bz = (this.home?.z ?? 0) + (this.baseOffset?.z ?? -3);
    const by = this.getHeight(bx, bz);
    const g = new THREE.Group();
    g.position.set(bx, by, bz);
    this.baseGroup = g;
    this.basePos = g.position.clone();

    // cabana: telhado só madeira (sem cone de neve — a base do cone virava
    // uma placa branca flutuante na altura do teto andável)
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), this.woodMat);
    body.position.y = 1.3;
    g.add(body);
    const roofMat = this.woodDarkMat.clone();
    roofMat.color = new THREE.Color(0xb8c4ce); // madeira com pó de neve
    roofMat.roughness = 1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.7, 4), roofMat);
    roof.position.y = 3.35;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.08), this.woodDarkMat);
    door.position.set(0.8, 0.85, 1.62);
    g.add(door);

    // baú de depósito na frente da cabana
    const chest = new THREE.Group();
    const chestBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), this.woodMat);
    chestBody.position.y = 0.25;
    const chestLid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.18, 0.6), this.woodDarkMat);
    chestLid.position.y = 0.56;
    const chestLock = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xd8b64a, roughness: 0.4, metalness: 0.6 })
    );
    chestLock.position.set(0, 0.45, 0.31);
    chest.add(chestBody, chestLid, chestLock);
    chest.position.set(2.6, 0, 1.2);
    g.add(chest);
    this.chestPos = new THREE.Vector3(bx + 2.6, by, bz + 1.2);

    // marcador girante em cima do baú
    this.chestMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({
        color: 0x7ad0ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.chestMarker.position.set(2.6, 1.1, 1.2);
    g.add(this.chestMarker);

    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.scene.add(g);
    // Telhado: ConeGeometry(3.2, 1.7) em y=3.35 → base ~2.5, pico ~4.2 (local).
    // Collider flat em 2.6 metia os pés dentro do cone (clipping). Altura andável
    // segue a inclinação do telhado (ver colliderTopAt).
    const roofH = 1.7;
    const roofY = 3.35;
    this.colliders.push({
      x: bx,
      z: bz,
      y: by,
      r: 2.35,
      top: by + roofY + roofH / 2, // pico (fallback)
      climbable: true,
      roofTipY: roofY + roofH / 2,
      roofBaseY: 2.6, // beirada = topo do corpo (step-up do chão ainda cabe em stepHeight)
      roofRadius: 2.35, // mesmo raio do collider: borda ~2.6m, centro = pico
    });
    this.colliders.push({
      x: this.chestPos.x,
      z: this.chestPos.z,
      y: by,
      r: 0.55,
      coverR: 0.95,
      top: by + 1.45, // alto o bastante para cobrir peito/mira
      climbable: true,
      cover: true,
    });
  }

  // ------------------------------------------------------------------
  // ITENS PARA DESCOBRIR
  // ------------------------------------------------------------------
  /** Tipo visual do pickup no chão (texturas procedurais). */
  _lootKind(def = {}) {
    if (def.countsForWin === false && def.trapId) return "trap";
    if (def.ammoType && !def.weaponId) return "ammo";
    if (def.trapId) return "trap";
    if (def.saveId?.startsWith?.("win:trophy") || /troféu/i.test(def.name || "")) return "trophy";
    if (def.weaponId) return "weapon";
    const n = (def.name || "").toLowerCase();
    if (/kit médico|kit medico|medkit/.test(n)) return "medkit";
    if (/poção|pocao|médic|medic/.test(n) || def.healthHeal) return "potion";
    if (/mapa/.test(n)) return "map";
    if (/rádio|radio/.test(n)) return "radio";
    if (/lanterna/.test(n)) return "lantern";
    if (/bússola|bussola/.test(n)) return "compass";
    if (/corda/.test(n)) return "rope";
    if (/lata|comida/.test(n)) return "cans";
    if (/isqueiro/.test(n)) return "lighter";
    if (/manta|cobertor/.test(n)) return "blanket";
    if (/garrafa|térmica|termica|thermos/.test(n)) return "thermos";
    if (/binóculo|binoculo/.test(n)) return "binoculars";
    if (/bota/.test(n)) return "boots";
    if (/sinalizador|flare/.test(n)) return "flare";
    return "crate";
  }

  _lootMat(kind, color) {
    const T = this.tex || {};
    const c = color ?? 0xc8d0d8;
    if (kind === "trophy") {
      return new THREE.MeshStandardMaterial({
        color: c,
        map: T.crystal || null,
        roughness: 0.22,
        metalness: 0.6,
        emissive: c,
        emissiveIntensity: 0.5,
      });
    }
    if (
      kind === "ammo" ||
      kind === "metal" ||
      kind === "radio" ||
      kind === "lantern" ||
      kind === "compass" ||
      kind === "lighter" ||
      kind === "cans" ||
      kind === "thermos" ||
      kind === "binoculars" ||
      kind === "boots" ||
      kind === "flare"
    ) {
      return new THREE.MeshStandardMaterial({
        color: c,
        map: T.metal || null,
        bumpMap: T.metalBump || null,
        bumpScale: 0.07,
        roughness: 0.38,
        metalness: 0.7,
        emissive: c,
        emissiveIntensity: 0.14,
      });
    }
    if (
      kind === "potion" ||
      kind === "medkit" ||
      kind === "map" ||
      kind === "rope" ||
      kind === "cloth" ||
      kind === "trap" ||
      kind === "blanket"
    ) {
      return new THREE.MeshStandardMaterial({
        color: c,
        map: T.cloth || null,
        bumpMap: T.clothBump || null,
        bumpScale: 0.05,
        roughness: 0.82,
        metalness: 0.04,
        emissive: c,
        emissiveIntensity: 0.12,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: c,
      map: T.crate || T.plank || null,
      bumpMap: T.crateBump || T.plankBump || null,
      bumpScale: 0.12,
      roughness: 0.78,
      metalness: 0.06,
      emissive: c,
      emissiveIntensity: 0.16,
    });
  }

  _addLootGlow(g, color, r = 0.62) {
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(r, 22),
      new THREE.MeshBasicMaterial({
        color: color ?? 0xa8d0e8,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.015;
    glow.userData.isGlow = true;
    // halo externo suave
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.92, r * 1.45, 28),
      new THREE.MeshBasicMaterial({
        color: color ?? 0xa8d0e8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.018;
    halo.userData.isGlow = true;
    g.add(glow, halo);
    g.userData.glow = glow;
    return glow;
  }

  /** Raridade do loot: epic (dourado), rare (azul), common (sem anel extra). */
  lootRarity(kind, weaponId = null) {
    if (kind === "trophy" || weaponId === "relic") return "epic";
    if (kind === "weapon" || kind === "potion" || kind === "medkit" || weaponId === "grenade") return "rare";
    return "common";
  }

  /** Anel de raridade girando no chão (só rare/epic). */
  _addRarityRing(g, rarity) {
    if (!rarity || rarity === "common") return;
    const color = rarity === "epic" ? 0xffc84a : 0x5ab0ff;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.62, 24, 1, 0, Math.PI * 1.6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: rarity === "epic" ? 0.55 : 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.userData.isGlow = true;
    g.add(ring);
    g.userData.rarityRing = ring;
  }

  _addLootParticles(g, color, count = 4) {
    if (count <= 0 || this.lowFx) return;
    const particles = [];
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.15;
      const h = 0.2 + Math.random() * 0.4;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = Math.sin(a) * r;
      particles.push({ phase: Math.random() * Math.PI * 2, radius: r });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: color ?? 0xffd75a,
        size: 0.04,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    g.add(points);
    g.userData.particles = { points, data: particles };
  }

  createItemMesh(color, kind = "crate") {
    const g = new THREE.Group();
    const mat = this._lootMat(kind, color);
    const accent = new THREE.MeshStandardMaterial({
      color: color ?? 0xffd75a,
      roughness: 0.45,
      metalness: 0.25,
      emissive: color ?? 0xffd75a,
      emissiveIntensity: 0.42,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2218,
      map: this.tex?.plank || null,
      roughness: 0.9,
      metalness: 0.05,
    });
    const gold = this._lootMat("metal", 0xd4a84a);

    if (kind === "trophy") {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 10), gold);
      pedestal.position.y = 0.14;
      // raios/spikes ao redor do pedestal
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), gold);
        spike.position.set(Math.cos(a) * 0.2, 0.18, Math.sin(a) * 0.2);
        spike.rotation.z = -a - Math.PI / 2;
        g.add(spike);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.18, 8), gold);
      stem.position.y = 0.3;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
      gem.position.y = 0.58;
      const gem2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), accent);
      gem2.position.y = 0.72;
      gem2.rotation.y = Math.PI / 4;
      // só emissive no gem — PointLight em todo loot engasga o GPU
      g.add(pedestal, stem, gem, gem2);
      g.userData.pulse = [gem, gem2];
      // partículas douradas girando ao redor
      this._addLootParticles(g, 0xd4a84a, 5);
    } else if (kind === "ammo") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.28), mat);
      box.position.y = 0.14;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.3), dark);
      rim.position.y = 0.24;
      // trava/fecho na frente
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), dark);
      latch.position.set(0, 0.18, 0.15);
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), accent);
      lock.rotation.x = Math.PI / 2;
      lock.position.set(0, 0.2, 0.16);
      g.add(box, rim, latch, lock);
      const shells = [];
      for (let i = 0; i < 4; i++) {
        const shell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6),
          new THREE.MeshStandardMaterial({
            color: color ?? 0xffd75a,
            roughness: 0.35,
            metalness: 0.35,
            emissive: color ?? 0xffd75a,
            emissiveIntensity: 0.6,
          })
        );
        shell.rotation.x = Math.PI / 2;
        shell.position.set(-0.1 + i * 0.07, 0.3, 0);
        g.add(shell);
        shells.push(shell);
      }
      g.userData.pulse = shells;
    } else if (kind === "trap") {
      // fallback raro — preferir createTrapPickupMesh(trapId)
      const body = this.createTrapMesh("mine");
      g.add(body);
      g.userData.pulse = body.userData.pulse;
      g.userData.lootAnim = "pulse";
      g.userData.trapType = "mine";
    } else if (kind === "potion" || kind === "medkit") {
      // jarro mágico com líquido vermelho (poção)
      const glass = new THREE.MeshStandardMaterial({
        color: 0xa8d8e8,
        roughness: 0.15,
        metalness: 0.05,
        transparent: true,
        opacity: 0.45,
        emissive: 0x204050,
        emissiveIntensity: 0.15,
      });
      const liquid = new THREE.MeshStandardMaterial({
        color: color ?? 0xc42838,
        roughness: 0.35,
        metalness: 0.05,
        emissive: color ?? 0xc42838,
        emissiveIntensity: 0.55,
      });
      const corkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.9 });
      const band = new THREE.MeshStandardMaterial({
        color: 0xd4a84a,
        roughness: 0.4,
        metalness: 0.65,
      });
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.32, 12), glass);
      bottle.position.y = 0.22;
      const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.2, 12), liquid);
      fluid.position.y = 0.18;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.1, 10), glass);
      neck.position.y = 0.42;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 8), corkMat);
      cork.position.y = 0.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14), band);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.36;
      // brilho do líquido (só emissive — sem PointLight)
      g.add(fluid, bottle, neck, cork, ring);
      g.userData.pulse = [fluid];
      g.userData.spin = cork;
    } else if (kind === "map") {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.32), mat);
      sheet.position.y = 0.12;
      sheet.rotation.z = 0.08;
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.32), accent);
      fold.position.set(-0.05, 0.14, 0);
      fold.rotation.z = -0.15;
      g.add(sheet, fold);
    } else if (kind === "radio") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.18), mat);
      body.position.y = 0.16;
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), accent);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0.06, 0.2, 0.1);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5), dark);
      ant.position.set(-0.08, 0.38, 0);
      ant.rotation.z = 0.2;
      g.add(body, dial, ant);
    } else if (kind === "lantern") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 8), dark);
      base.position.y = 0.08;
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8),
        new THREE.MeshStandardMaterial({
          color: color ?? 0xffd75a,
          map: this.tex?.crystal || null,
          emissive: color ?? 0xffd75a,
          emissiveIntensity: 0.65,
          roughness: 0.35,
          metalness: 0.2,
          transparent: true,
          opacity: 0.9,
        })
      );
      glass.position.y = 0.24;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 8), dark);
      cap.position.y = 0.38;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 5, 12, Math.PI), dark);
      handle.position.y = 0.44;
      g.add(base, glass, cap, handle);
      g.userData.pulse = [glass];
    } else if (kind === "compass") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), gold);
      body.position.y = 0.1;
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14),
        new THREE.MeshStandardMaterial({
          color: 0xa8e0ff,
          emissive: 0x4080a0,
          emissiveIntensity: 0.35,
          roughness: 0.2,
          metalness: 0.4,
        })
      );
      glass.position.y = 0.14;
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.18), accent);
      needle.position.y = 0.16;
      g.add(body, glass, needle);
      g.userData.spin = needle;
    } else if (kind === "rope") {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 8, 18), mat);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.12;
      const coil2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 14), accent);
      coil2.rotation.x = Math.PI / 2;
      coil2.position.y = 0.16;
      g.add(coil, coil2);
    } else if (kind === "cans") {
      for (let i = 0; i < 3; i++) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), mat);
        can.position.set(-0.1 + i * 0.1, 0.14, (i % 2) * 0.06);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.06, 10), accent);
        label.position.copy(can.position);
        g.add(can, label);
      }
    } else if (kind === "lighter") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.06), mat);
      body.position.y = 0.14;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), dark);
      top.position.y = 0.26;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.1, 5),
        new THREE.MeshStandardMaterial({
          color: 0xff9a3c,
          emissive: 0xff6020,
          emissiveIntensity: 0.9,
          roughness: 0.5,
        })
      );
      flame.position.y = 0.36;
      g.add(body, top, flame);
      g.userData.pulse = [flame];
    } else if (kind === "blanket") {
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), mat);
      fold.position.y = 0.1;
      fold.rotation.y = 0.2;
      const fold2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.24), accent);
      fold2.position.set(0.02, 0.16, 0);
      fold2.rotation.y = -0.15;
      g.add(fold, fold2);
    } else if (kind === "thermos") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.36, 12), mat);
      body.position.y = 0.24;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10), accent);
      cup.position.y = 0.46;
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 5, 14, Math.PI), dark);
      strap.position.set(0.12, 0.3, 0);
      strap.rotation.z = Math.PI / 2;
      g.add(body, cup, strap);
    } else if (kind === "binoculars") {
      const left = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 10), mat);
      left.rotation.x = Math.PI / 2;
      left.position.set(-0.08, 0.16, 0);
      const right = left.clone();
      right.position.x = 0.08;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), dark);
      bridge.position.y = 0.16;
      const lensL = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), accent);
      lensL.position.set(-0.08, 0.16, 0.12);
      const lensR = lensL.clone();
      lensR.position.x = 0.08;
      g.add(left, right, bridge, lensL, lensR);
    } else if (kind === "boots") {
      for (const side of [-1, 1]) {
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.22), mat);
        boot.position.set(side * 0.1, 0.12, 0);
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), dark);
        toe.position.set(side * 0.1, 0.08, 0.14);
        g.add(boot, toe);
      }
    } else if (kind === "flare") {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.42, 8), mat);
      tube.position.y = 0.28;
      tube.rotation.z = 0.35;
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.12, 6),
        new THREE.MeshStandardMaterial({
          color: 0xff4040,
          emissive: 0xff2020,
          emissiveIntensity: 0.85,
          roughness: 0.45,
        })
      );
      tip.position.set(0.08, 0.5, 0);
      tip.rotation.z = 0.35;
      g.add(tube, tip);
      g.userData.pulse = [tip];
    } else if (kind === "medkit") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), mat);
      box.position.y = 0.18;
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.02), accent);
      crossV.position.set(0, 0.2, 0.14);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.02), accent);
      crossH.position.set(0, 0.2, 0.14);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 5, 10, Math.PI), dark);
      handle.position.y = 0.34;
      g.add(box, crossV, crossH, handle);
    } else {
      // caixa de suprimentos com cantoneiras
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.36), mat);
      box.position.y = 0.2;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), mat);
      lid.position.y = 0.35;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), accent);
      stripe.position.y = 0.22;
      // dobradiças/fechos metálicos nas laterais
      for (const [hx, hz] of [
        [-0.18, 0.18],
        [0.18, 0.18],
      ]) {
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), dark);
        hinge.position.set(hx, 0.32, hz);
        g.add(hinge);
      }
      // fecho frontal
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), dark);
      clasp.position.set(0, 0.35, 0.19);
      // marcação "X" na tampa
      const markX1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), accent);
      markX1.rotation.y = Math.PI / 4;
      markX1.position.set(0, 0.38, 0);
      const markX2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), accent);
      markX2.rotation.y = -Math.PI / 4;
      markX2.position.set(0, 0.38, 0);
      g.add(box, lid, stripe, clasp, markX1, markX2);
      for (const [sx, sy, sz] of [
        [0.17, 0.2, 0.17],
        [-0.17, 0.2, 0.17],
        [0.17, 0.2, -0.17],
        [-0.17, 0.2, -0.17],
      ]) {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), dark);
        corner.position.set(sx, sy, sz);
        g.add(corner);
      }
    }

    this._addLootGlow(g, color, kind === "trophy" ? 0.55 : 0.42);
    this._addRarityRing(g, this.lootRarity(kind));
    // loot sem castShadow — dezenas de casters matam o shadow map
    g.traverse((m) => {
      if (m.isMesh && !m.userData.isGlow) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    });
    return g;
  }

  _spawnItemDef(def, { countsForWin = true, nearBase = false, midRing = false, saveId = null } = {}) {
    let x = 0;
    let z = 0;
    const ox = this.home?.x ?? 0;
    const oz = this.home?.z ?? 0;
    const wantNear = nearBase || !!def.nearBase;
    const wantMid = !wantNear && (midRing || !!def.midRing);
    let placed = false;
    for (let tries = 0; tries < 80; tries++) {
      if (wantNear) {
        // kit inicial: perto o bastante pra achar, longe o bastante pra não lotar o spawn
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 12; // 14–26
        x = ox + Math.cos(a) * r;
        z = oz + Math.sin(a) * r;
      } else if (wantMid) {
        // anel médio — exige sair da fogueira
        const a = Math.random() * Math.PI * 2;
        const r = 32 + Math.random() * 36; // 32–68
        x = ox + Math.cos(a) * r;
        z = oz + Math.sin(a) * r;
      } else {
        x = (Math.random() * 2 - 1) * this.bounds * 0.92;
        z = (Math.random() * 2 - 1) * this.bounds * 0.92;
      }
      const h = this.getHeight(x, z);
      const distHome = Math.hypot(x - ox, z - oz);
      const minDist = wantNear ? 12 : wantMid ? 28 : 36;
      const farFromBase = distHome > minDist;
      const flat = this.getSlope(x, z) < 0.85;
      if (h > this.waterLevel + 0.6 && farFromBase && (!wantNear || flat)) {
        placed = true;
        break;
      }
    }
    // fallback garantido: anel andável (sem empilhar na fogueira)
    if (!placed && (wantNear || wantMid)) {
      const a = Math.random() * Math.PI * 2;
      const r = wantNear ? 18 : 40;
      x = ox + Math.cos(a) * r;
      z = oz + Math.sin(a) * r;
    }
    const kind = this._lootKind({ ...def, countsForWin, saveId });
    let mesh;
    try {
      mesh = def.weaponId
        ? this.createWeaponPickupMesh(def.weaponId, def.color)
        : def.trapId
          ? this.createTrapPickupMesh(def.trapId, def.color)
          : this.createItemMesh(def.color, kind);
    } catch (err) {
      console.warn("[Neve] loot mesh falhou, fallback caixa:", def?.name, err);
      mesh = this.createItemMesh(def.color ?? 0xa8d0e8, "crate");
    }
    const y = this.groundHeight(x, z) + 0.18;
    mesh.position.set(x, y, z);
    mesh.visible = true;
    mesh.userData.baseScale = mesh.scale.x || 1;
    this.scene.add(mesh);
    // só essenciais explícitos / tocha / machado — o resto pode rarear por dificuldade
    const essential =
      !!def.essential || def.weaponId === "torch" || def.weaponId === "axe";
    this.items.push({
      name: def.name,
      color: def.color,
      kind,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      collected: false,
      // minimapa: só o kit inicial marcado; o resto revela por proximidade / husky
      discovered: !!def.essential && wantNear,
      phase: Math.random() * Math.PI * 2,
      weaponId: def.weaponId || null,
      ammoType: def.ammoType || null,
      ammoAmount: def.amount || 0,
      trapId: def.trapId || null,
      trapAmount: def.trapId ? def.amount || 1 : 0,
      healthHeal: def.healthHeal || 0,
      countsForWin,
      essential,
      nearBase: wantNear,
      saveId,
    });
  }

  buildItems() {
    this.items = [];
    let i = 0;
    for (const def of CONFIG.items) {
      this._spawnItemDef(def, {
        countsForWin: true,
        nearBase: !!def.nearBase,
        midRing: !!def.midRing,
        saveId: `win:${i++}`,
      });
    }
    i = 0;
    for (const def of CONFIG.weaponPickups || []) {
      this._spawnItemDef(def, {
        countsForWin: false,
        nearBase: !!def.nearBase,
        midRing: !!def.midRing,
        saveId: `wpn:${i++}`,
      });
    }
    i = 0;
    for (const def of CONFIG.ammoPickups || []) {
      this._spawnItemDef(def, {
        countsForWin: false,
        nearBase: !!def.nearBase,
        midRing: !!def.midRing,
        saveId: `ammo:${i++}`,
      });
    }
    i = 0;
    for (const def of CONFIG.trapPickups || []) {
      this._spawnItemDef(def, {
        countsForWin: false,
        nearBase: !!def.nearBase,
        midRing: !!def.midRing,
        saveId: `trap:${i++}`,
      });
    }
    i = 0;
    for (const def of CONFIG.healPickups || []) {
      this._spawnItemDef(def, {
        countsForWin: false,
        nearBase: !!def.nearBase,
        midRing: !!def.midRing,
        saveId: `heal:${i++}`,
      });
    }
    // vitória = itens de sobrevivência + troféu do urso + troféu do Boto
    this.itemsTotal = CONFIG.items.length + 2;
  }

  /**
   * Aplica multiplicadores de dificuldade (spawn delay, rareia pickups).
   * Spawn/loot thinning só uma vez por mundo; `thinPickups: false` no Continuar.
   */
  applyDifficulty(diffId, opts = {}) {
    this.diff = getDifficulty(diffId);
    if (!this._diffSpawnScaled) {
      const mul = this.diff.spawnDelayMul ?? 1;
      for (const p of this.pendingEnemies || []) {
        p.at *= mul;
      }
      this.pendingEnemies?.sort((a, b) => a.at - b.at);
      this._diffSpawnScaled = true;
    }

    const thin = opts.thinPickups !== false;
    if (thin && !this._diffLootThinned) {
      // RNG seedado — host/guest Hard ficam alinhados no co-op
      const rng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
      const loot = this.diff.loot ?? 1;
      if (loot < 1) {
        for (const it of this.items || []) {
          if (it.countsForWin || it.collected) continue;
          // kit / armas / tocha ficam no mapa — rareia só munição, trap e cura
          if (it.essential || it.weaponId) continue;
          if (rng() > loot) this.collectItem(it, { instant: true });
        }
      }
      this._capNearBaseLoot(rng);
      this._diffLootThinned = true;
    }
  }

  /**
   * Limita quantos pickups ficam no anel da fogueira por dificuldade.
   * Essenciais (tocha, lança…) têm prioridade; o excesso some.
   */
  _capNearBaseLoot(rng) {
    const cap = this.diff?.nearBaseCap;
    if (cap == null || cap < 0) return;
    const ox = this.home?.x ?? 0;
    const oz = this.home?.z ?? 0;
    const radius = 28;
    const near = (this.items || []).filter((it) => {
      if (it.collected) return false;
      const d = Math.hypot(it.pos.x - ox, it.pos.z - oz);
      return d <= radius;
    });
    if (near.length <= cap) return;

    // manter essenciais primeiro; entre o resto, sorteia quem sai
    const keepers = [];
    const expendable = [];
    for (const it of near) {
      if (it.essential || it.weaponId === "torch") keepers.push(it);
      else expendable.push(it);
    }
    // embaralha descartáveis
    for (let i = expendable.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [expendable[i], expendable[j]] = [expendable[j], expendable[i]];
    }
    let kept = keepers.length;
    for (const it of expendable) {
      if (kept < cap) {
        kept++;
        continue;
      }
      this.collectItem(it, { instant: true });
    }
    // se ainda passou do cap só com essenciais, remove essenciais extras
    // (nunca a última tocha / lança se forem as únicas)
    if (keepers.length > cap) {
      const ranked = [...keepers].sort((a, b) => {
        const rank = (it) =>
          it.weaponId === "torch" ? 0 : it.weaponId === "spear" ? 1 : it.essential ? 2 : 3;
        return rank(a) - rank(b);
      });
      for (let i = cap; i < ranked.length; i++) {
        // nunca apaga a última tocha do mapa inteiro
        if (ranked[i].weaponId === "torch") {
          const torches = (this.items || []).filter(
            (t) => t.weaponId === "torch" && !t.collected && t !== ranked[i]
          );
          if (!torches.length) continue;
        }
        this.collectItem(ranked[i], { instant: true });
      }
    }
  }

  nearestItem(playerPos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const it of this.items) {
      if (it.collected) continue;
      const d = this.wrapDistXZ(playerPos, it.pos);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  collectItem(item, { instant = false } = {}) {
    if (!item || item.collected) return;
    item.collected = true;
    if (instant || !item.mesh) {
      if (item.mesh) this.scene.remove(item.mesh);
      return;
    }
    // scale-out animado; remove no updateLootFx
    item._collectT = 0.22;
    this.spawnLootBurst(item.mesh.position, item.color ?? 0xa8d0e8, 14);
  }

  /** Faíscas / neve colorida ao pegar ou matar. */
  spawnLootBurst(pos, color = 0xa8d0e8, count = 12) {
    if (!this.lootFx) this.lootFx = [];
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 5, 4),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      mesh.position.copy(pos);
      mesh.position.y += 0.3;
      this.scene.add(mesh);
      this.lootFx.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          1.5 + Math.random() * 2.5,
          (Math.random() - 0.5) * 3.5
        ),
        ttl: 0.45 + Math.random() * 0.35,
      });
    }
  }

  updateLootFx(dt) {
    if (!this.lootFx?.length) return;
    for (let i = this.lootFx.length - 1; i >= 0; i--) {
      const p = this.lootFx[i];
      p.ttl -= dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.ttl * 2);
      if (p.ttl <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry?.dispose?.();
        p.mesh.material?.dispose?.();
        this.lootFx.splice(i, 1);
      }
    }
  }

  updateItems(dt, elapsed, playerPos) {
    for (const it of this.items) {
      if (it.collected) {
        if (it._collectT != null && it.mesh) {
          it._collectT -= dt;
          const t = Math.max(0, it._collectT / 0.22);
          it.mesh.scale.setScalar(t * 1.15);
          it.mesh.position.y += dt * 1.8;
          if (it._collectT <= 0) {
            this.scene.remove(it.mesh);
            it.mesh = null;
            it._collectT = null;
          }
        }
        continue;
      }
      const bob = Math.sin(elapsed * 2.2 + it.phase) * 0.1;
      const anim = it.mesh.userData.lootAnim || "spin";
      // animação coerente com o tipo (cerca não gira como gema; mina pisca LED)
      if (anim === "sway") {
        it.mesh.rotation.y = it.phase * 0.2;
        it.mesh.rotation.z = Math.sin(elapsed * 1.5 + it.phase) * 0.06;
        it.mesh.rotation.x = 0;
      } else if (anim === "wobble") {
        it.mesh.rotation.y = elapsed * 0.55 + it.phase;
        it.mesh.rotation.x = Math.sin(elapsed * 2.4 + it.phase) * 0.14;
        it.mesh.rotation.z = Math.cos(elapsed * 1.8 + it.phase) * 0.08;
      } else if (anim === "pulse") {
        it.mesh.rotation.y = elapsed * 0.45 + it.phase;
        it.mesh.rotation.x = 0;
        it.mesh.rotation.z = 0;
      } else {
        it.mesh.rotation.y = elapsed * 1.1 + it.phase;
        it.mesh.rotation.x = 0;
        it.mesh.rotation.z = 0;
      }
      // assenta no chão (altura do toro no XZ atual do mesh)
      const gy = this.groundHeight(it.mesh.position.x, it.mesh.position.z) + 0.18;
      it.pos.y = this.groundHeight(it.pos.x, it.pos.z) + 0.18;
      it.mesh.position.y = gy + bob;
      it.mesh.visible = true;
      // highlight perto do jogador (distância wrap-aware — coords contínuas)
      let near = 0;
      if (playerPos) {
        const d = this.wrapDistXZ(playerPos, it.pos);
        if (d < 10) near = 1 - d / 10;
      }
      const base = it.mesh.userData.baseScale || 1;
      const breathe = base * (1 + Math.sin(elapsed * 3.5 + it.phase) * 0.04 + near * 0.16);
      it.mesh.scale.setScalar(breathe);
      const glow = it.mesh.userData.glow;
      if (glow?.material) {
        // brilho mais visível na neve/noite — loot não “some” no branco
        glow.material.opacity = 0.4 + near * 0.35 + Math.sin(elapsed * 4 + it.phase) * 0.08;
        glow.scale.setScalar(1.2 + near * 0.45);
      }
      for (const m of it.mesh.userData.pulse || []) {
        if (m.material?.emissiveIntensity != null) {
          m.material.emissiveIntensity = 0.5 + Math.sin(elapsed * 5 + it.phase) * 0.45;
        }
      }
      if (it.mesh.userData.spin) {
        it.mesh.userData.spin.rotation.y = elapsed * 3;
      }
      // anel de raridade gira devagar
      if (it.mesh.userData.rarityRing) {
        it.mesh.userData.rarityRing.rotation.z = elapsed * 1.1 + it.phase;
      }
      // partículas só perto do jogador (atualizar BufferAttribute em todo loot = hitch)
      if (it.mesh.userData.particles && near > 0.05) {
        const p = it.mesh.userData.particles;
        const pos = p.points.geometry.attributes.position;
        for (let i = 0; i < p.data.length; i++) {
          const d = p.data[i];
          const t = elapsed * 0.8 + d.phase;
          pos.setX(i, Math.cos(t) * d.radius);
          pos.setY(i, 0.2 + Math.sin(elapsed * 1.5 + d.phase) * 0.3);
          pos.setZ(i, Math.sin(t) * d.radius);
        }
        pos.needsUpdate = true;
      }
      if (!it.discovered && playerPos && this.wrapDistXZ(playerPos, it.pos) < 40) {
        it.discovered = true;
        this._justDiscovered = it;
      }
    }
    this.updateLootFx(dt);
    if (this.chestMarker) {
      this.chestMarker.rotation.y = elapsed * 2;
    }
  }

  // consumido pelo Game para mostrar mensagem de descoberta
  takeDiscovery() {
    const it = this._justDiscovered || null;
    this._justDiscovered = null;
    return it;
  }

  // ------------------------------------------------------------------
  // COELHOS (lebres árticas)
  // ------------------------------------------------------------------
  buildRabbits() {
    this.rabbits = [];
    const bodyMats = [0xf6f8fa, 0xeceff2, 0xdde2e6].map(
      (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 1, map: this.tex.fur || null })
    );
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

    for (let i = 0; i < 8; i++) {
      const mat = bodyMats[(Math.random() * bodyMats.length) | 0];
      const r = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
      body.scale.set(1, 0.85, 1.35);
      body.position.y = 0.16;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
      head.position.set(0, 0.28, 0.18);
      const earGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.16, 5);
      const earL = new THREE.Mesh(earGeo, mat);
      earL.position.set(-0.04, 0.42, 0.16);
      const earR = new THREE.Mesh(earGeo, mat);
      earR.position.set(0.04, 0.42, 0.16);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), white);
      tail.position.set(0, 0.2, -0.2);
      r.add(body, head, earL, earR, tail);
      r.traverse((m) => {
        if (m.isMesh) m.castShadow = true;
      });

      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = (Math.random() * 2 - 1) * this.bounds * 0.7;
        z = (Math.random() * 2 - 1) * this.bounds * 0.7;
        const h = this.getHeight(x, z);
        if (h > this.waterLevel + 0.8 && h < 9) break;
      }
      r.position.set(x, this.getHeight(x, z), z);
      r.userData = {
        state: "idle",
        timer: 1 + Math.random() * 2,
        dir: Math.random() * Math.PI * 2,
        hopT: 0,
        hopDur: 0.45,
        speed: 1.6,
      };
      this.scene.add(r);
      this.rabbits.push(r);
    }
  }

  updateRabbits(dt, playerPos) {
    for (const r of this.rabbits) {
      const d = r.userData;
      const distPlayer = playerPos ? this.wrapDistXZ(r.position, playerPos) : 99;
      const scared = distPlayer < 4.5;

      if (d.state === "idle") {
        d.timer -= dt * (scared ? 6 : 1);
        if (d.timer <= 0) {
          d.state = "hop";
          d.hopT = 0;
          d.speed = scared ? 3.4 : 1.6;
          if (scared && playerPos) {
            const { dx, dz } = this.wrapDelta(playerPos.x, playerPos.z, r.position.x, r.position.z);
            d.dir = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6;
          } else {
            d.dir = Math.random() * Math.PI * 2;
          }
        }
      } else {
        d.hopT += dt;
        const p = d.hopT / d.hopDur;
        const nx = r.position.x + Math.sin(d.dir) * d.speed * dt;
        const nz = r.position.z + Math.cos(d.dir) * d.speed * dt;
        const nh = this.getHeight(nx, nz);
        if (nh > this.waterLevel + 0.5) {
          r.position.x = this.wrapCoord(nx);
          r.position.z = this.wrapCoord(nz);
        } else {
          d.dir += Math.PI;
        }
        r.position.y = this.getHeight(r.position.x, r.position.z) + Math.sin(Math.min(p, 1) * Math.PI) * 0.28;
        r.rotation.y = d.dir;
        if (p >= 1) {
          d.state = "idle";
          d.timer = scared ? 0.05 : 0.4 + Math.random() * 1.8;
          r.position.y = this.getHeight(r.position.x, r.position.z);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // INIMIGOS (ursos minion/elite + lobos)
  // ------------------------------------------------------------------
  buildEnemies() {
    this.enemies = [];
    this.pendingEnemies = [];
    this.placedTraps = [];
    this.projectiles = [];
    this.explosions = [];
    this.tracers = [];
    this.lootFx = [];
    this.bear = null;
    const hooks = {
      onAttack: (dmg, dir, enemy) => {
        enemy?.triggerStartle?.();
        this.onEnemyAttack?.(dmg, dir, enemy);
        this.onBearAttack?.(dmg, dir);
      },
      onEvent: (ev, enemy) => {
        if (ev === "growl") enemy?.triggerStartle?.();
        if (ev === "teleport") enemy?.triggerStartle?.();
        this.onEnemyEvent?.(ev, enemy);
        this.onBearEvent?.(ev);
      },
    };
    this._enemyHooks = hooks;

    // fila escalonada: nada nasce no t=0; longe da base
    for (const [type, cfg] of Object.entries(CONFIG.enemies)) {
      const n = cfg.count || 0;
      const baseDelay = cfg.spawnDelay ?? 45;
      const stagger = cfg.spawnStagger ?? 25;
      for (let i = 0; i < n; i++) {
        this.pendingEnemies.push({
          type,
          at: baseDelay + i * stagger + Math.random() * 8,
        });
      }
    }
    this.pendingEnemies.sort((a, b) => a.at - b.at);
  }

  _meshForEnemy(cfg) {
    switch (cfg.mesh) {
      case "wolf":
        return createWolfMesh(this.tex);
      case "fox":
        return createSnowFoxMesh(this.tex);
      case "werewolf":
        return createWerewolfMesh(this.tex);
      case "mula":
        return createMulaMesh(this.tex);
      case "horse":
        return createHorseMesh(this.tex);
      case "dromedary":
        return createDromedaryMesh(this.tex);
      case "pony":
        return createPonyMesh(this.tex);
      case "slender":
        return createSlenderMesh();
      case "chuck":
        return createChuckMesh();
      case "panda":
        return createPandaMesh(this.tex, { scale: cfg.scale || 1.4 });
      case "saci":
        return createSaciMesh();
      case "trex":
        return createTrexMesh({ scale: cfg.scale || 1.8 });
      case "boto":
        return createBotoMesh();
      case "ptero":
        return createPteroMesh();
      default:
        return createBearMesh(this.tex, {
          scale: cfg.scale || 1,
          color: cfg.color,
          dark: cfg.dark,
        });
    }
  }

  /** Spawna um inimigo longe da base (nunca perto do spawn inicial). */
  spawnEnemyNow(type) {
    const cfg = CONFIG.enemies[type];
    if (!cfg) return null;
    const home = cfg.spawnOnIce
      ? spawnPointOnIce(this)
      : spawnPointFar(this, cfg.spawnMin || 48);
    const mesh = this._meshForEnemy(cfg);
    const gy = this.groundHeight(home.x, home.z);
    // Boto começa submerso e emerge
    mesh.position.set(home.x, cfg.ai === "boto" ? gy - 1.2 : gy, home.z);
    this.scene.add(mesh);
    const enemy = new Enemy(type, mesh, home, this);
    enemy.netId = this._nextNetId++;
    this.enemies.push(enemy);
    if (type === "bear_elite" || !this.bear) this.bear = enemy;
    this.onEnemySpawned?.(enemy);
    return enemy;
  }

  /** Spawna um inimigo em posição exata (usado pela dungeon secreta). */
  spawnEnemyAt(type, x, z, opts = {}) {
    const cfg = CONFIG.enemies[type];
    if (!cfg) return null;
    const mesh = this._meshForEnemy(cfg);
    mesh.position.set(x, this.groundHeight(x, z), z);
    this.scene.add(mesh);
    const enemy = new Enemy(type, mesh, new THREE.Vector3(x, 0, z), this);
    enemy.netId = this._nextNetId++;
    if (opts.dungeon) enemy.dungeon = true;
    this.enemies.push(enemy);
    return enemy;
  }

  flushPendingEnemies(elapsed) {
    if (!this.authority) return;
    while (this.pendingEnemies.length && this.pendingEnemies[0].at <= elapsed) {
      const next = this.pendingEnemies.shift();
      this.spawnEnemyNow(next.type);
    }
  }

  updateEnemies(dt, elapsed, playerPos) {
    if (!this.authority) return;
    this.flushPendingEnemies(elapsed);
    for (const e of this.enemies) {
      e.update(dt, elapsed, playerPos, this._enemyHooks);
    }
    // independente: sem combate entre si — só afastamento suave
    for (const e of this.enemies) {
      if (e.alive && !e.tamed) e.softSeparatePeers(dt);
    }
  }

  /** Dano + morte/drops compartilhado por melee, tiros e explosões. */
  _applyDamage(enemy, dmg, opts = {}) {
    // Guest co-op: host aplica o dano real (snap atualiza HP)
    if (!this.authority && !opts.fromHost) {
      this.onDeferredHit?.(enemy.netId, dmg);
      return { deferred: true, enemy };
    }
    const from =
      opts.from ||
      opts.pos ||
      (enemy.mesh
        ? enemy.mesh.position.clone().add(new THREE.Vector3(0, 0, 1))
        : null);
    const result = enemy.takeDamage(dmg, { from });
    if (opts.slowElite && enemy.type === "bear_elite") {
      enemy.applySlow(opts.slowElite);
    }
    if (result === "killed") {
      const dropPos = enemy.mesh.position.clone();
      dropPos.y = this.groundHeight(dropPos.x, dropPos.z);
      this.spawnLootBurst(dropPos, 0xe8f0f8, 18);
      if (enemy.cfg.dropsTrophy) {
        this.spawnGroundLoot({
          name: enemy.cfg.trophyName || "Troféu do Urso Alfa",
          color: enemy.cfg.trophyColor ?? 0xffd75a,
          pos: dropPos,
          countsForWin: true,
          discovered: true,
          saveId: enemy.cfg.trophySaveId || "win:trophy",
        });
      }
      // loot de armas/munição
      const looted = this.rollEnemyDrops(enemy, dropPos);
      enemy._lastDrops = looted;
      this.onEnemyEvent?.("dead", enemy);
      this.onBearEvent?.("dead");
    } else if (result) {
      this.onEnemyEvent?.("hurt", enemy);
    }
    return enemy;
  }

  /** Dano a um inimigo específico (NPC vs NPC). */
  damageEnemyDirect(enemy, dmg, opts = {}) {
    if (!enemy?.alive) return null;
    return this._applyDamage(enemy, dmg, opts);
  }

  /** Aplica dano ao inimigo vivo mais próximo no alcance. */
  damageEnemyAt(pos, dmg, range, opts = {}) {
    let best = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (!e.alive || e.tamed) continue;
      const d = this.wrapDistXZ(e.mesh.position, pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return null;
    return this._applyDamage(best, dmg, { ...opts, from: pos });
  }

  /** Dano em área (granada): atinge todos no raio, com queda linear. */
  damageEnemiesInRadius(pos, dmg, radius) {
    const hit = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = this.wrapDistXZ(e.mesh.position, pos);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.6;
      this._applyDamage(e, Math.round(dmg * falloff), { from: pos });
      hit.push(e);
    }
    return hit;
  }

  /**
   * Raio vs cilindros de cobertura (árvores, pedras, cabana, cercas…).
   * Bloqueia tiros se o impacto em Y estiver abaixo do topo do obstáculo.
   * @returns {{ dist: number, collider: object } | null}
   */
  rayHitsCover(origin, dir, maxDist) {
    if (!origin || !dir || !(maxDist > 0)) return null;
    const dx = dir.x;
    const dz = dir.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return null;

    let bestT = maxDist;
    let best = null;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;

    for (const c of this.colliders) {
      if (!c) continue;
      const cr = c.coverR ?? c.r;
      if (!(cr >= 0.25)) continue;
      const top = c.top ?? (c.y || 0) + 3;
      const bottom = (c.y ?? 0) - 0.6;
      const n = this.nearestImage(ox, oz, c.x, c.z);
      const fx = ox - n.x;
      const fz = oz - n.z;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - cr * cr;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const sqrtD = Math.sqrt(disc);
      const inv = 0.5 / a;
      const tNear = (-b - sqrtD) * inv;
      const tFar = (-b + sqrtD) * inv;
      for (const t of [tNear, tFar]) {
        if (t < 0.2 || t >= bestT) continue;
        const yHit = oy + dir.y * t;
        if (yHit > top + 0.12) continue; // por cima da pedra/árvore
        if (yHit < bottom) continue;
        bestT = t;
        best = c;
      }
    }
    return best ? { dist: bestT, collider: best } : null;
  }

  /** Ponto dentro de um cilindro de cobertura? */
  pointInCover(pos) {
    if (!pos) return null;
    for (const c of this.colliders) {
      if (!c) continue;
      const cr = c.coverR ?? c.r;
      if (!(cr >= 0.25)) continue;
      const top = c.top ?? (c.y || 0) + 3;
      if (pos.y > top + 0.12) continue;
      if (pos.y < (c.y ?? 0) - 0.6) continue;
      const n = this.nearestImage(pos.x, pos.z, c.x, c.z);
      const dx = pos.x - n.x;
      const dz = pos.z - n.z;
      if (dx * dx + dz * dz <= cr * cr) return c;
    }
    return null;
  }

  /**
   * Ponto sob a mira: inimigo, cobertura ou chão ao longo do raio da câmera.
   * Usado para alinhar tiro do olho com a crosshair (3ª pessoa / órbita).
   */
  rayAimPoint(origin, dir, maxDist = 80) {
    if (!origin || !dir || !(maxDist > 0)) {
      return origin.clone().addScaledVector(dir || new THREE.Vector3(0, 0, -1), 40);
    }
    const d = dir.clone().normalize();
    let bestT = maxDist;

    // Inimigos
    const v = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const center = e.mesh.position.clone();
      center.y += 0.9 * (e.cfg.scale || 1);
      v.subVectors(center, origin);
      const t = v.dot(d);
      if (t < 0.4 || t > bestT) continue;
      const perp = v.clone().addScaledVector(d, -t).length();
      const hitR = 0.9 * (e.cfg.scale || 1) + 0.5;
      if (perp < hitR) bestT = t;
    }

    // Cobertura
    const cover = this.rayHitsCover(origin, d, bestT);
    if (cover && cover.dist < bestT) bestT = cover.dist;

    // Chão: amostra ao longo do raio
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = (maxDist * i) / steps;
      if (t >= bestT) break;
      const x = origin.x + d.x * t;
      const y = origin.y + d.y * t;
      const z = origin.z + d.z * t;
      const gy = this.groundHeight(x, z);
      if (y <= gy + 0.05) {
        bestT = t;
        break;
      }
    }

    // perto demais: mantém o ponto no raio (não joga a mira para 40m)
    if (!(bestT > 0.15)) bestT = Math.min(maxDist, 12);
    return origin.clone().addScaledVector(d, bestT);
  }

  /**
   * Tiro instantâneo (raycast simplificado): inimigo mais próximo ao longo do raio.
   * Obstáculos (árvore/pedra/etc.) bloqueiam antes do alvo.
   * @returns {{ enemy, dist } | null}
   */
  hitscan(origin, dir, dmg, maxDist = 50, opts = {}) {
    let best = null;
    let bestT = maxDist;
    const v = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive || e.tamed) continue;
      const center = e.mesh.position.clone();
      center.y += 0.9 * (e.cfg.scale || 1);
      v.subVectors(center, origin);
      const t = v.dot(dir);
      if (t < 0.5 || t > bestT) continue;
      const perp = v.clone().addScaledVector(dir, -t).length();
      const hitR = 0.9 * (e.cfg.scale || 1) + 0.5;
      if (perp < hitR) {
        bestT = t;
        best = e;
      }
    }
    const cover = this.rayHitsCover(origin, dir, best ? bestT : Math.min(maxDist, 40));
    const tracerDist = cover ? cover.dist : best ? bestT : Math.min(maxDist, 40);
    this._spawnTracer(origin, dir, tracerDist);
    if (cover && (!best || cover.dist < bestT - 0.05)) return null;
    if (!best) return null;
    this._applyDamage(best, dmg, { ...opts, from: origin });
    return { enemy: best, dist: bestT };
  }

  _spawnTracer(origin, dir, dist) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin.clone().addScaledVector(dir, 0.8),
      origin.clone().addScaledVector(dir, dist),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ mesh: line, ttl: 0.09 });
  }

  /**
   * Projétil físico: flecha (mata no impacto) ou granada (explode no fuse).
   */
  spawnProjectile({
    pos,
    dir,
    speed,
    damage,
    kind = "arrow",
    fuse = 0,
    explodeRadius = 0,
    slowElite = 0,
    ttl = 6,
  }) {
    let mesh;
    if (kind === "grenade") {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0x3a4a34,
          roughness: 0.55,
          metalness: 0.45,
          map: this.tex?.metal || null,
        })
      );
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.018, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x8a9a4a, roughness: 0.5, metalness: 0.6 })
      );
      band.rotation.x = Math.PI / 2;
      const pin = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.01, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xc8c0a0, metalness: 0.8, roughness: 0.3 })
      );
      pin.position.y = 0.12;
      mesh.add(body, band, pin);
    } else {
      // flecha: haste + ponta + penas
      mesh = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.018, 0.62, 6),
        new THREE.MeshStandardMaterial({
          color: 0xc4a06a,
          roughness: 0.85,
          map: this.tex?.plank || null,
        })
      );
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.12, 6),
        new THREE.MeshStandardMaterial({
          color: 0xb8c4d0,
          roughness: 0.3,
          metalness: 0.75,
          map: this.tex?.metal || null,
        })
      );
      tip.position.y = 0.37;
      const nock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.014, 0.06, 5),
        new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 })
      );
      nock.position.y = -0.32;
      const featherMat = new THREE.MeshStandardMaterial({
        color: 0xd85a3a,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), featherMat);
        feather.position.set(Math.cos(a) * 0.03, -0.22, Math.sin(a) * 0.03);
        feather.rotation.y = a;
        feather.rotation.x = 0.35;
        mesh.add(feather);
      }
      mesh.add(shaft, tip, nock);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      vel: dir.clone().multiplyScalar(speed),
      damage,
      kind,
      fuse,
      explodeRadius,
      slowElite,
      ttl: Math.max(1.5, ttl),
      resting: false,
      trail: kind === "arrow" ? this._makeArrowTrail(pos) : null,
    });
  }

  _makeArrowTrail(pos) {
    const geo = new THREE.BufferGeometry();
    const n = 8;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([pos.x, pos.y, pos.z], i * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe0a8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    return { mesh: line, pts: arr, n, i: 0 };
  }

  explodeAt(pos, dmg, radius) {
    this.damageEnemiesInRadius(pos, dmg, radius);
    // visual: esfera que expande e some + luz
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb84a, transparent: true, opacity: 0.85 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
    ball.position.copy(pos);
    const light = new THREE.PointLight(0xffa03c, 5, radius * 3);
    light.position.copy(pos);
    this.scene.add(ball, light);
    this.explosions.push({ ball, light, t: 0, dur: 0.45, radius });
    this.onExplosion?.(pos);
  }

  _disposeProjectile(p) {
    if (p?.trail?.mesh) {
      this.scene.remove(p.trail.mesh);
      p.trail.mesh.geometry?.dispose?.();
      p.trail.mesh.material?.dispose?.();
      p.trail = null;
    }
    if (p?.mesh) this.scene.remove(p.mesh);
  }

  updateProjectiles(dt) {
    const gravity = 14;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.explodeAt(p.mesh.position.clone(), p.damage, p.explodeRadius || 5);
          this._disposeProjectile(p);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.ttl <= 0) {
        this._disposeProjectile(p);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.resting) continue;

      const prev = p.mesh.position.clone();
      // flecha quase reta (mira = impacto); granada mantém arco
      p.vel.y -= gravity * dt * (p.kind === "grenade" ? 1.3 : 0.06);
      p.mesh.position.addScaledVector(p.vel, dt);
      // projétil em coords contínuas (mesmo espaço do jogador — sem teleporte)
      if (p.kind !== "grenade") {
        const spd = p.vel.length();
        if (spd > 1e-3) {
          const dirN = p.vel.clone().multiplyScalar(1 / spd);
          p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN);
        }
        if (p.trail?.pts) {
          const t = p.trail;
          const idx = (t.i % t.n) * 3;
          t.pts[idx] = p.mesh.position.x;
          t.pts[idx + 1] = p.mesh.position.y;
          t.pts[idx + 2] = p.mesh.position.z;
          t.i++;
          t.mesh.geometry.attributes.position.needsUpdate = true;
        }
      }

      // cobertura: flecha/granada param em árvore/pedra (colisores lógicos wrap-aware)
      {
        const travel = new THREE.Vector3().subVectors(p.mesh.position, prev);
        const travelLen = travel.length();
        if (travelLen > 1e-4) {
          const tdir = travel.clone().multiplyScalar(1 / travelLen);
          const coverHit = this.rayHitsCover(prev, tdir, travelLen + 0.05);
          if (coverHit || this.pointInCover(p.mesh.position)) {
            const stopDist = coverHit ? coverHit.dist : 0;
            if (coverHit) p.mesh.position.copy(prev).addScaledVector(tdir, Math.max(0.05, stopDist - 0.05));
            if (p.kind === "grenade") {
              this.explodeAt(p.mesh.position.clone(), p.damage, p.explodeRadius || 5);
              this._disposeProjectile(p);
              this.projectiles.splice(i, 1);
              continue;
            }
            p.resting = true;
            p.ttl = Math.min(p.ttl, 2.5);
            p.vel.set(0, 0, 0);
            if (p.trail?.mesh) {
              this.scene.remove(p.trail.mesh);
              p.trail.mesh.geometry?.dispose?.();
              p.trail.mesh.material?.dispose?.();
              p.trail = null;
            }
            continue;
          }
        }
      }

      // impacto em inimigo (só flechas — granada explode pelo fuse)
      if (p.kind !== "grenade") {
        for (const e of this.enemies) {
          if (!e.alive || e.tamed) continue;
          const center = e.mesh.position.clone();
          center.y += 0.9 * (e.cfg.scale || 1);
          const hitR = 0.9 * (e.cfg.scale || 1) + 0.35;
          if (this.wrapDist(p.mesh.position, center) < hitR) {
            this._applyDamage(e, p.damage, {
              slowElite: p.slowElite,
              from: p.mesh.position.clone(),
            });
            this.onProjectileHit?.(e);
            this._disposeProjectile(p);
            this.projectiles.splice(i, 1);
            break;
          }
        }
        if (!this.projectiles.includes(p)) continue;
      }

      // chão
      const ground = this.groundHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y <= ground + 0.05) {
        p.mesh.position.y = ground + 0.05;
        if (p.kind === "grenade") {
          // quica e para
          if (Math.abs(p.vel.y) > 2.5) {
            p.vel.y = -p.vel.y * 0.35;
            p.vel.x *= 0.6;
            p.vel.z *= 0.6;
          } else {
            p.resting = true;
          }
        } else {
          // flecha finca no chão e some depois
          p.resting = true;
          p.ttl = Math.min(p.ttl, 3);
        }
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.t += dt;
      const k = ex.t / ex.dur;
      if (k >= 1) {
        this.scene.remove(ex.ball, ex.light);
        this.explosions.splice(i, 1);
        continue;
      }
      ex.ball.scale.setScalar(1 + k * ex.radius * 0.8);
      ex.ball.material.opacity = 0.85 * (1 - k);
      ex.light.intensity = 5 * (1 - k);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.ttl -= dt;
      if (tr.ttl <= 0) {
        this.scene.remove(tr.mesh);
        this.tracers.splice(i, 1);
      } else {
        tr.mesh.material.opacity = tr.ttl / 0.09;
      }
    }
  }

  /** Sorteia drops de arma/munição do inimigo e espalha no chão. */
  rollEnemyDrops(enemy, basePos) {
    const table = enemy.cfg.drops || [];
    const lootMul = this.diff?.loot ?? 1;
    const got = [];
    let i = 0;
    for (const row of table) {
      const chance = Math.min(1, (row.chance ?? 1) * lootMul);
      if (Math.random() > chance) continue;
      const ang = Math.random() * Math.PI * 2;
      const r = 1.4 + i * 0.7;
      const pos = new THREE.Vector3(
        basePos.x + Math.cos(ang) * r,
        0,
        basePos.z + Math.sin(ang) * r
      );
      pos.y = this.groundHeight(pos.x, pos.z) + 0.15;
      const wdef = row.weaponId ? CONFIG.weapons[row.weaponId] : null;
      const ammoType = row.ammoType || (wdef?.ammoType && row.amount ? wdef.ammoType : null);
      // suporte a range de quantidade: amount: [min, max]
      let amt = row.amount || 0;
      if (Array.isArray(amt) && amt.length === 2) {
        const [min, max] = amt;
        amt = Math.floor(min + Math.random() * (max - min + 1));
      }
      this.spawnGroundLoot({
        name:
          row.name ||
          wdef?.name ||
          CONFIG.traps[row.trapId]?.name ||
          "Ferramenta",
        color: row.color ?? 0xc8d0d8,
        pos,
        weaponId: row.weaponId || null,
        ammoType,
        ammoAmount: amt,
        trapId: row.trapId || null,
        trapAmount: row.trapId ? amt || 1 : 0,
        healthHeal: row.healthHeal || 0,
        countsForWin: false,
        discovered: true,
      });
      got.push(row.weaponId || row.ammoType || row.trapId || (row.healthHeal ? "potion" : null));
      i++;
    }
    // garantia: se nada caiu, deixa munição ou tocha
    if (!got.length) {
      const pos = basePos.clone();
      pos.x += 1.2;
      pos.y = this.groundHeight(pos.x, pos.z) + 0.15;
      this.spawnGroundLoot({
        name: "Tocha",
        color: 0xff9a3c,
        pos,
        weaponId: "torch",
        discovered: true,
      });
      got.push("torch");
    }
    return got;
  }

  spawnGroundLoot({
    name,
    color,
    pos,
    weaponId = null,
    ammoType = null,
    ammoAmount = 0,
    trapId = null,
    trapAmount = 0,
    healthHeal = 0,
    countsForWin = false,
    discovered = true,
    saveId = null,
  }) {
    const kind = this._lootKind({
      name,
      weaponId,
      ammoType,
      trapId,
      healthHeal,
      countsForWin,
      saveId,
    });
    const mesh = weaponId
      ? this.createWeaponPickupMesh(weaponId, color)
      : trapId
        ? this.createTrapPickupMesh(trapId, color)
        : this.createItemMesh(color, kind);
    mesh.position.copy(pos);
    mesh.userData.baseScale = 1;
    this.scene.add(mesh);
    this.items.push({
      name,
      color,
      kind,
      mesh,
      pos: pos.clone(),
      collected: false,
      discovered,
      phase: Math.random() * Math.PI * 2,
      weaponId,
      ammoType,
      ammoAmount: ammoAmount || 0,
      trapId,
      trapAmount: trapAmount || 0,
      healthHeal: healthHeal || 0,
      countsForWin,
      saveId: saveId || `dyn:${name}:${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  /** Pickup visual distinto para armas (textura metal/madeira). */
  createWeaponPickupMesh(weaponId, color) {
    const g = new THREE.Group();
    const T = this.tex || {};
    const mat = new THREE.MeshStandardMaterial({
      color: color ?? 0xc8d0d8,
      map: T.metal || null,
      bumpMap: T.metalBump || null,
      bumpScale: 0.08,
      roughness: 0.28,
      metalness: 0.72,
      emissive: color ?? 0xc8d0d8,
      emissiveIntensity: 0.28,
    });
    const wood = new THREE.MeshStandardMaterial({
      color: 0x7a5230,
      map: T.plank || T.crate || null,
      bumpMap: T.plankBump || T.crateBump || null,
      bumpScale: 0.1,
      roughness: 0.88,
      metalness: 0.05,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2a32,
      roughness: 0.55,
      metalness: 0.45,
      map: T.metal || null,
    });
    const leather = new THREE.MeshStandardMaterial({
      color: 0x5a3a24,
      roughness: 0.92,
      map: T.cloth || T.plank || null,
    });
    const w = CONFIG.weapons[weaponId];
    const fire = w?.fire;
    if (weaponId === "revolver") {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.38), dark);
      frame.position.set(0, 0.22, 0.05);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.38, 8), mat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.26, 0.32);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.11, 10), mat);
      cyl.rotation.z = Math.PI / 2;
      cyl.position.set(0, 0.2, 0.08);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), wood);
      grip.position.set(0, 0.1, -0.12);
      grip.rotation.x = 0.35;
      g.add(frame, barrel, cyl, grip);
    } else if (weaponId === "shotgun") {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.32), wood);
      stock.position.set(0, 0.18, -0.28);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), dark);
      body.position.set(0, 0.22, 0.08);
      for (const sx of [-0.035, 0.035]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.55, 7), mat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(sx, 0.26, 0.42);
        g.add(barrel);
      }
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), leather);
      band.position.set(0, 0.2, -0.05);
      g.add(stock, body, band);
    } else if (fire === "hitscan" || weaponId === "ak47") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.52), dark);
      body.position.set(0, 0.22, 0.1);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.26), wood);
      stock.position.set(0, 0.18, -0.28);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.5, 8), mat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.26, 0.48);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), mat);
      sight.position.set(0, 0.32, 0.28);
      g.add(body, stock, barrel, sight);
      if (weaponId === "ak47") {
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.1), dark);
        mag.position.set(0, 0.05, 0.12);
        mag.rotation.x = 0.28;
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.22), wood);
        handguard.position.set(0, 0.22, 0.32);
        g.add(mag, handguard);
      }
    } else if (weaponId === "crossbow") {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), wood);
      stock.position.set(0, 0.18, 0.05);
      const limbs = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.07), mat);
      limbs.position.set(0, 0.26, 0.28);
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.72, 4),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d0, emissive: 0x605040, emissiveIntensity: 0.2 })
      );
      string.rotation.z = Math.PI / 2;
      string.position.set(0, 0.26, 0.22);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), wood);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(0, 0.28, 0.4);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5), mat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.28, 0.62);
      g.add(stock, limbs, string, bolt, tip);
    } else if (fire === "projectile" || weaponId === "bow") {
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 7, 18, Math.PI), wood);
      limb.rotation.y = Math.PI / 2;
      limb.position.y = 0.42;
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.018, 5, 14, Math.PI), leather);
      wrap.rotation.y = Math.PI / 2;
      wrap.position.y = 0.42;
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.68, 4),
        new THREE.MeshStandardMaterial({
          color: 0xf0e8d8,
          emissive: 0x506080,
          emissiveIntensity: 0.35,
          roughness: 0.35,
        })
      );
      string.position.y = 0.42;
      const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.58, 5), wood);
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.42, 0.22);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 5), mat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.42, 0.52);
      g.add(limb, wrap, string, arrow, tip);
    } else if (weaponId === "grenade") {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat);
      ball.position.y = 0.16;
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.02, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0x8a9a4a, metalness: 0.55, roughness: 0.45 })
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.16;
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 4, 8), mat);
      pin.position.y = 0.3;
      g.add(ball, band, pin);
    } else if (weaponId === "torch") {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 7), wood);
      stick.position.y = 0.35;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 7), leather);
      wrap.position.y = 0.55;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.26, 7),
        new THREE.MeshStandardMaterial({
          color: 0xff9a3c,
          emissive: 0xff6a20,
          emissiveIntensity: 0.85,
          roughness: 0.55,
        })
      );
      flame.position.y = 0.74;
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.14, 5),
        new THREE.MeshBasicMaterial({ color: 0xffe08a })
      );
      core.position.y = 0.7;
      g.add(stick, wrap, flame, core);
      g.userData.pulse = [flame, core];
    } else if (weaponId === "axe") {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.7, 7), wood);
      handle.position.y = 0.38;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.07), mat);
      head.position.set(0.1, 0.68, 0);
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.02), mat);
      bit.position.set(0.28, 0.68, 0);
      g.add(handle, head, bit);
    } else if (weaponId === "spear") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.95, 7), wood);
      shaft.position.y = 0.5;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), mat);
      tip.position.y = 1.05;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), leather);
      wrap.position.y = 0.9;
      g.add(shaft, tip, wrap);
    } else {
      // melee / claymore / relic
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.035), mat);
      blade.position.y = 0.48;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), mat);
      tip.position.y = 0.85;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.06), dark);
      guard.position.y = 0.2;
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 7), wood);
      hilt.position.y = 0.08;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat);
      pommel.position.y = -0.02;
      g.add(blade, tip, guard, hilt, pommel);
      if (weaponId === "relic") {
        blade.material = new THREE.MeshStandardMaterial({
          color: 0x9a5aff,
          emissive: 0x7a3aef,
          emissiveIntensity: 0.65,
          roughness: 0.25,
          metalness: 0.35,
        });
        tip.material = blade.material;
      }
    }
    this._addLootParticles(g, color ?? 0xc8d0d8, this.lowFx ? 0 : 5);
    this._addLootGlow(g, color, 0.48);
    this._addRarityRing(g, this.lootRarity("weapon", weaponId));
    g.traverse((m) => {
      if (m.isMesh && !m.userData.isGlow) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    });
    return g;
  }

  /** @deprecated use damageEnemyAt */
  bearDamage(dmg) {
    if (!this.bear) return false;
    return !!this.damageEnemyAt(this.bear.mesh.position, dmg, 0.1);
  }

  nearestHostile(playerPos, maxDist = 26) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.alive || e.tamed) continue;
      const d = this.wrapDistXZ(e.mesh.position, playerPos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  anyEnemyChasing(playerPos) {
    for (const e of this.enemies) {
      if (e.alive && (e.state === "chase" || e.state === "flee")) {
        return { chasing: true, dist: this.wrapDistXZ(e.mesh.position, playerPos) };
      }
    }
    return { chasing: false, dist: 999 };
  }

  // ------------------------------------------------------------------
  // MINIMAPA (pré-renderizado)
  // ------------------------------------------------------------------
  buildMinimap() {
    if (typeof document === "undefined") return; // smoke test roda em Node
    const S = 180;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    const col = new THREE.Color();
    const img = ctx.createImageData(S, S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px / S) * this.size - this.half;
        const z = (py / S) * this.size - this.half;
        const h = this.getHeight(x, z);
        if (h < this.waterLevel) col.setHex(CONFIG.colors.ice);
        else this.colorAt(x, z, h, col);
        const idx = (py * S + px) * 4;
        img.data[idx] = col.r * 255;
        img.data[idx + 1] = col.g * 255;
        img.data[idx + 2] = col.b * 255;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.minimapCanvas = canvas;
  }

  // ------------------------------------------------------------------
  // LOOP
  // ------------------------------------------------------------------
  update(dt, elapsed, night, dusk = 0, playerPos = null) {
    this.nightF = night; // usado pela IA (lobisomem/slender)
    // IA em coords lógicas; depois apresentamos o toro ao redor do jogador
    this.prepareTorusLogic();
    const wind = this._windAmt ?? this.season?.windMul ?? 1;
    if (this.grassMat?.userData.shader) {
      this.grassMat.userData.shader.uniforms.uTime.value = elapsed;
      if (this.grassMat.userData.shader.uniforms.uWind) {
        this.grassMat.userData.shader.uniforms.uWind.value = wind;
      }
    }
    const rainAmt = this._rainAmt || 0;
    for (const tree of this.trees) {
      const phase = tree.userData.phase || 0;
      const canopy = tree.userData.canopyRoot;
      // brisa leve no tronco + flutter forte na copa (e shake de chuva)
      tree.rotation.z = Math.sin(elapsed * (0.55 + wind * 0.2) + phase) * 0.012 * wind;
      if (canopy) {
        const flutter = Math.sin(elapsed * (2.2 + wind * 1.1) + phase * 1.7) * 0.04 * (0.35 + wind);
        const dripShake = rainAmt > 0.15 ? Math.sin(elapsed * 18 + phase * 3) * 0.028 * rainAmt : 0;
        canopy.rotation.z = flutter + dripShake;
        canopy.rotation.x = flutter * 0.55 + dripShake * 0.4;
      }
    }

    const wrap = this.half * 1.5;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > wrap) cloud.position.x = -wrap;
    }
    this.cloudMat.color
      .setScalar(0.25 + 0.75 * (1 - night))
      .lerp(this._duskTint || (this._duskTint = new THREE.Color(0xffa06a)), dusk * 0.55);

    this.fireflyMat.opacity = night * 0.8;
    if (night > 0.05) {
      const fp = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < this.fireflyBase.length; i++) {
        const b = this.fireflyBase[i];
        fp.setY(i, b.y + Math.sin(elapsed * 1.6 + b.phase) * 0.4);
        fp.setX(i, b.x + Math.sin(elapsed * 0.7 + b.phase * 2) * 0.6);
      }
      fp.needsUpdate = true;
    }

    for (const bird of this.birds) {
      const d = bird.userData;
      d.angle += d.speed * dt;
      bird.position.set(
        Math.cos(d.angle) * d.radius,
        d.height + Math.sin(d.angle * 3) * 2,
        Math.sin(d.angle) * d.radius
      );
      bird.rotation.y = -d.angle;
      const flap = Math.sin(elapsed * 9 + d.flapPhase) * 0.55;
      d.left.rotation.y = flap;
      d.right.rotation.y = -flap;
      bird.visible = night < 0.6;
    }

    this.updateSnowfall(dt, elapsed, playerPos);
    this.updateRainfall(dt, elapsed, playerPos);
    this.updateSandstorm(dt, elapsed, playerPos);
    this.updateShootingStar(dt, night);
    this.updateAurora(dt, elapsed, night, playerPos);

    // fogueira
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const flick = 1 + Math.sin(elapsed * (9 + i * 3) + i * 2) * 0.18 + Math.sin(elapsed * 23 + i) * 0.08;
      f.scale.set(flick, flick * (1 + Math.sin(elapsed * 13 + i) * 0.15), flick);
      f.material.opacity = 0.7 + Math.sin(elapsed * 17 + i * 4) * 0.15;
    }
    this.fireLight.intensity =
      (1.0 + Math.sin(elapsed * 11) * 0.18 + Math.sin(elapsed * 27) * 0.1) * (0.75 + night * 0.9);
    {
      const sp = this.smoke.geometry.attributes.position;
      for (let i = 0; i < this.smokeData.length; i++) {
        const s = this.smokeData[i];
        s.y += s.speed * dt;
        if (s.y > 3.6) s.y = 0.8;
        sp.setY(i, s.y);
        sp.setX(i, Math.sin(elapsed * 0.8 + s.phase) * 0.18 * (s.y * 0.4));
        sp.setZ(i, Math.cos(elapsed * 0.6 + s.phase) * 0.14 * (s.y * 0.4));
      }
      sp.needsUpdate = true;
    }

    this.updateItems(dt, elapsed, playerPos);
    this.updateRabbits(dt, playerPos);
    this.updateEnemies(dt, elapsed, playerPos);
    this.updateTraps(dt);
    this.updateProjectiles(dt);
    this.presentTorusVisuals(playerPos);
  }

  // ------------------------------------------------------------------
  // ARMADILHAS (mina / isca / cerca) — só perto da base
  // ------------------------------------------------------------------
  createTrapMesh(type) {
    const g = new THREE.Group();
    const T = this.tex || {};
    const metal = new THREE.MeshStandardMaterial({
      color: 0x5a5e66,
      roughness: 0.4,
      metalness: 0.7,
      map: T.metal || null,
      bumpMap: T.metalBump || null,
      bumpScale: 0.05,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2e3036,
      roughness: 0.55,
      metalness: 0.5,
      map: T.metal || null,
    });
    const wood = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 0.92,
      metalness: 0.05,
      map: T.plank || T.crate || null,
      bumpMap: T.plankBump || T.crateBump || null,
      bumpScale: 0.1,
    });
    const woodDark = new THREE.MeshStandardMaterial({
      color: 0x4a3018,
      roughness: 0.95,
      map: T.plank || null,
    });

    if (type === "mine") {
      // disco de pressão + LED vermelho piscante
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.1, 14), metal);
      disc.position.y = 0.05;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 18), dark);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.1;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 12), dark);
      plate.position.y = 0.12;
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0xff3030,
          emissive: 0xff1010,
          emissiveIntensity: 1.1,
          roughness: 0.25,
        })
      );
      led.position.y = 0.2;
      const hazard = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.34, 16),
        new THREE.MeshBasicMaterial({
          color: 0xffc040,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      hazard.rotation.x = -Math.PI / 2;
      hazard.position.y = 0.11;
      g.add(disc, rim, plate, led, hazard);
      g.userData.led = led;
      g.userData.pulse = [led];
      g.userData.lootAnim = "pulse";
    } else if (type === "bait") {
      // pedaço de carne + osso — isca, não mina
      const meatMat = new THREE.MeshStandardMaterial({
        color: 0xb04828,
        roughness: 0.85,
        emissive: 0x401008,
        emissiveIntensity: 0.2,
      });
      const fatMat = new THREE.MeshStandardMaterial({ color: 0xe8c090, roughness: 0.7 });
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.55 });
      const meat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), meatMat);
      meat.scale.set(1.35, 0.7, 1.0);
      meat.position.y = 0.14;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.22), meatMat);
      slab.position.set(0.05, 0.12, 0.02);
      slab.rotation.z = 0.2;
      const fat = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), fatMat);
      fat.position.set(-0.12, 0.18, 0.06);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.58, 7), boneMat);
      bone.rotation.z = Math.PI / 2 + 0.15;
      bone.position.set(0, 0.16, -0.02);
      const knub1 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), boneMat);
      knub1.position.set(-0.28, 0.16, -0.02);
      const knub2 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), boneMat);
      knub2.position.set(0.28, 0.16, -0.02);
      // moscas/brilho de atrativo
      const lure = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 5),
        new THREE.MeshStandardMaterial({
          color: 0xff8040,
          emissive: 0xff6020,
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.85,
        })
      );
      lure.position.set(0.08, 0.28, 0.08);
      g.add(meat, slab, fat, bone, knub1, knub2, lure);
      g.userData.pulse = [lure];
      g.userData.lootAnim = "wobble";
    } else {
      // cerca de madeira improvisada (postes + ripas + arame)
      for (const dx of [-0.65, 0.65]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.35, 7), wood);
        post.position.set(dx, 0.68, 0);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 5), woodDark);
        tip.position.set(dx, 1.4, 0);
        g.add(post, tip);
      }
      for (const y of [0.35, 0.7, 1.05]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 0.08), wood);
        rail.position.set(0, y, 0);
        g.add(rail);
      }
      // diagonal / ripa cruzada
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.06), woodDark);
      cross.position.set(0, 0.7, 0.04);
      cross.rotation.z = 0.45;
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 })
      );
      wire.rotation.z = Math.PI / 2;
      wire.position.set(0, 1.2, 0.02);
      g.add(cross, wire);
      g.userData.lootAnim = "sway";
    }
    g.userData.trapType = type;
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return g;
  }

  /** Pickup no chão: mesma silhueta da armadilha + brilho (mina ≠ isca ≠ cerca). */
  createTrapPickupMesh(trapId, color) {
    const type = CONFIG.traps[trapId] ? trapId : "mine";
    const g = this.createTrapMesh(type);
    // pickups maiores e legíveis na neve
    const scale = type === "fence" ? 1.05 : type === "bait" ? 1.45 : 1.35;
    g.scale.setScalar(scale);
    g.userData.baseScale = scale;
    const glowColor =
      color ??
      (type === "mine" ? 0xff4040 : type === "bait" ? 0xc87840 : 0x8a6a40);
    this._addLootGlow(g, glowColor, type === "fence" ? 0.7 : 0.55);
    this._addRarityRing(g, "rare");
    this._addLootParticles(g, glowColor, this.lowFx ? 2 : type === "bait" ? 5 : 4);
    g.userData.trapType = type;
    if (!g.userData.lootAnim) {
      g.userData.lootAnim = type === "fence" ? "sway" : type === "bait" ? "wobble" : "pulse";
    }
    g.visible = true;
    return g;
  }

  /**
   * Coloca armadilha em (x,z). Retorna false se inválido.
   */
  placeTrap(type, x, z) {
    const cfg = CONFIG.traps[type];
    if (!cfg) return false;
    const maxD = CONFIG.trapPlaceMaxDist || 35;
    if (this.wrapDistXZ(this.campfirePos, { x, z }) > maxD) return false;

    const y = this.groundHeight(x, z);
    const mesh = this.createTrapMesh(type);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const trap = {
      type,
      cfg,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      ttl: cfg.duration || 0,
      alive: true,
      collider: null,
    };

    if (type === "fence") {
      const col = {
        x,
        z,
        y,
        r: cfg.radius || 1.1,
        coverR: (cfg.radius || 1.1) * 1.05,
        top: y + 1.4,
        climbable: false,
        temporary: true,
        cover: true,
      };
      this.colliders.push(col);
      trap.collider = col;
    }

    if (type === "bait") {
      // atrai o inimigo vivo mais próximo
      let best = null;
      let bestD = cfg.lureRadius || 28;
      for (const e of this.enemies) {
        if (!e.alive || e.tamed) continue;
        const d = this.wrapDistXZ(e.mesh.position, trap.pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        best.lurePos = trap.pos.clone();
        best.lureTimer = cfg.duration || 20;
        best.state = "chase";
      }
    }

    this.placedTraps.push(trap);
    return true;
  }

  removeTrap(trap) {
    if (!trap.alive) return;
    trap.alive = false;
    this.scene.remove(trap.mesh);
    if (trap.collider) {
      const i = this.colliders.indexOf(trap.collider);
      if (i >= 0) this.colliders.splice(i, 1);
    }
  }

  updateTraps(dt) {
    if (!this.placedTraps) return;
    for (let i = this.placedTraps.length - 1; i >= 0; i--) {
      const t = this.placedTraps[i];
      if (!t.alive) {
        this.placedTraps.splice(i, 1);
        continue;
      }

      if (t.type === "mine") {
        const led = t.mesh.userData.led;
        if (led?.material) {
          const blink = 0.55 + Math.sin(performance.now() * 0.01) * 0.55;
          if (led.material.emissiveIntensity != null) led.material.emissiveIntensity = blink;
          else led.material.opacity = blink;
        }
        for (const e of this.enemies) {
          if (!e.alive || e.tamed) continue;
          if (this.wrapDistXZ(e.mesh.position, t.pos) < (t.cfg.triggerRadius || 2.8)) {
            this.explodeAt(t.pos.clone().setY(t.pos.y + 0.5), t.cfg.damage || 70, t.cfg.explodeRadius || 5);
            this.removeTrap(t);
            this.placedTraps.splice(i, 1);
            break;
          }
        }
        continue;
      }

      // bait / fence: TTL
      t.ttl -= dt;
      if (t.type === "bait") {
        t.mesh.rotation.y += dt * 1.5;
        // re-atrai inimigos próximos ocasionalmente
        if (Math.random() < dt * 0.4) {
          for (const e of this.enemies) {
            if (!e.alive || e.tamed) continue;
            if (this.wrapDistXZ(e.mesh.position, t.pos) < (t.cfg.lureRadius || 28)) {
              e.lurePos = t.pos.clone();
              e.lureTimer = Math.max(e.lureTimer || 0, 4);
              if (e.state === "wander") e.state = "chase";
            }
          }
        }
      }
      if (t.ttl <= 0) {
        this.removeTrap(t);
        this.placedTraps.splice(i, 1);
      }
    }
  }

  getSpawn() {
    const sx = (this.home?.x ?? 0) + (this.spawnOffset?.x ?? 0);
    const sz = (this.home?.z ?? 0) + (this.spawnOffset?.z ?? 0);
    return new THREE.Vector3(sx, this.groundHeight(sx, sz), sz);
  }

  /**
   * Mundo em topologia de esfera/globo (toro no plano XZ):
   * sai por um lado → entra pelo oposto. Sem parede no fim do mapa.
   */
  wrapCoord(v) {
    const s = this.size;
    const h = this.half;
    // faixa canônica [-half, half)
    return ((((v + h) % s) + s) % s) - h;
  }

  /** Envolve posição no mapa (ignora Y). Sem efeito na dungeon. */
  wrapToBounds(v) {
    if (!v || this.dungeonActive) return v;
    v.x = this.wrapCoord(v.x);
    v.z = this.wrapCoord(v.z);
    return v;
  }

  /** @deprecated use wrapToBounds — mantido p/ saves/docs antigos */
  clampToBounds(v) {
    return this.wrapToBounds(v);
  }

  /**
   * Delta XZ mais curto entre dois pontos (atravessa a “costura” do globo).
   * @returns {{ dx: number, dz: number }}
   */
  wrapDelta(ax, az, bx, bz) {
    const s = this.size;
    const h = this.half;
    let dx = bx - ax;
    let dz = bz - az;
    if (dx > h) dx -= s;
    else if (dx < -h) dx += s;
    if (dz > h) dz -= s;
    else if (dz < -h) dz += s;
    return { dx, dz };
  }

  /** Distância horizontal wrap-aware (ou 3D se ambos tiverem y). */
  wrapDist(a, b) {
    if (!a || !b) return Infinity;
    const { dx, dz } = this.wrapDelta(a.x, a.z, b.x, b.z);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    return Math.hypot(dx, dz, dy);
  }

  /** Distância só no plano XZ (aggro / minimapa). */
  wrapDistXZ(a, b) {
    if (!a || !b) return Infinity;
    const { dx, dz } = this.wrapDelta(a.x, a.z, b.x, b.z);
    return Math.hypot(dx, dz);
  }

  /**
   * Topo andável de um collider em (x,z). Telhados com pico usam inclinação.
   */
  colliderTopAt(c, x, z) {
    if (c.roofTipY == null || !(c.roofRadius > 0)) {
      return c.top ?? c.y + 3;
    }
    const n = this.nearestImage(x, z, c.x, c.z);
    const d = Math.hypot(x - n.x, z - n.z);
    const t = Math.min(1, d / c.roofRadius);
    const base = c.roofBaseY ?? 2.6;
    return c.y + c.roofTipY + (base - c.roofTipY) * t;
  }

  /**
   * Altura do chão sob (x,z): terreno + topo de objetos climbable.
   * feetY = altura atual dos pés (para step-up / continuar em cima).
   */
  supportHeight(x, z, feetY, radius = CONFIG.player.radius, stepHeight = CONFIG.player.stepHeight) {
    let y = this.groundHeight(x, z);
    for (const c of this.colliders) {
      if (!c.climbable || c.top == null) continue;
      const n = this.nearestImage(x, z, c.x, c.z);
      const dx = x - n.x;
      const dz = z - n.z;
      // um pouco além do raio para não cair no canto da pedra
      const reach = c.r + radius * 0.55;
      if (dx * dx + dz * dz > reach * reach) continue;
      const top = this.colliderTopAt(c, x, z);
      const onTop = feetY >= top - 0.35;
      const canStep = top - feetY <= stepHeight + 0.1;
      if (onTop || canStep) y = Math.max(y, top);
    }
    return y;
  }

  /**
   * Resolve paredes e step-up. Retorna true se o player subiu num obstáculo.
   * Colliders ficam em coords lógicas; o jogador pode estar em qualquer célula do toro.
   */
  collide(p, radius, stepHeight = CONFIG.player.stepHeight) {
    let stepped = false;
    for (const c of this.colliders) {
      const n = this.nearestImage(p.x, p.z, c.x, c.z);
      const top = this.colliderTopAt(c, p.x, p.z);
      // já em cima: não empurra (fica andando no topo)
      if (c.climbable && p.y >= top - 0.2) continue;
      // bem acima (pulo por cima): ignora
      if (p.y > top + 0.5) continue;

      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 <= 1e-8) continue;

      // step-up: sobe no topo em vez de travar
      if (c.climbable && top - p.y <= stepHeight) {
        if (p.y < top) {
          p.y = top;
          stepped = true;
        }
        continue;
      }

      const d = Math.sqrt(d2);
      p.x = n.x + (dx / d) * min;
      p.z = n.z + (dz / d) * min;
    }
    return stepped;
  }
}
