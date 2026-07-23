import * as THREE from "three";
import { CONFIG } from "./config.js";
import { makeTextures } from "./textures.js";
import {
  Enemy,
  createBearMesh,
  createWolfMesh,
  createWerewolfMesh,
  createMulaMesh,
  createSlenderMesh,
  createChuckMesh,
  spawnPointFar,
} from "./enemies.js";

// Mundo de inverno: terreno nevado por heightmap, lago congelado onde dá
// para andar, nevasca, base com fogueira e baú, itens escondidos e um urso.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.size = CONFIG.world.size;
    this.half = this.size / 2;
    this.bounds = this.half - 4;
    this.waterLevel = CONFIG.world.waterLevel;
    this.colliders = []; // troncos/rochas/base: { x, z, y, r }
    this.trees = [];

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
    this.leafMats = [0x3d6a4c, 0x477455, 0x365e45].map(
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

    this.buildTerrain();
    this.buildIce();
    this.scatterTrees();
    this.scatterRocks();
    this.buildGrass();
    this.buildClouds();
    this.buildFireflies();
    this.buildBirds();
    this.buildSnowfall();
    this.buildShootingStar();
    this.buildAurora();
    this.buildCampfire();
    this.buildBase();
    this.buildItems();
    this.buildRabbits();
    this.buildEnemies();
    this.buildMinimap();
  }

  // ------------------------------------------------------------------
  // TERRENO
  // ------------------------------------------------------------------
  getHeight(x, z) {
    const A = CONFIG.world.amplitude;
    let h =
      CONFIG.world.baseHeight +
      Math.sin(x * 0.035) * Math.cos(z * 0.032) * A * 0.45 +
      Math.sin(x * 0.09 + z * 0.05) * A * 0.2 +
      Math.cos(x * 0.021 - z * 0.062) * A * 0.28 +
      Math.sin((x + z) * 0.13) * A * 0.08;
    const ridge = Math.pow(Math.abs(Math.sin(x * 0.012) * Math.sin(z * 0.01)), 2.2);
    h += ridge * A * 1.7;
    return h;
  }

  // altura onde se pisa: o gelo cobre o lago
  groundHeight(x, z) {
    return Math.max(this.getHeight(x, z), this.waterLevel);
  }

  isOnIce(x, z) {
    return this.getHeight(x, z) < this.waterLevel;
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
    return out;
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, CONFIG.world.segments, CONFIG.world.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);
      this.colorAt(x, z, h, col);
      const v = 0.98 + Math.sin(x * 1.7 + z * 2.3) * 0.02;
      colors.push(col.r * v, col.g * v, col.b * v);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        map: this.tex.snowGround || null,
        bumpMap: this.tex.snowGroundBump || null,
        bumpScale: 0.25,
      })
    );
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
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

    // pinheiro com neve acumulada em cada camada
    for (let k = 0; k < 3; k++) {
      const r = 1.5 - k * 0.32;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.7, 8), leafMat);
      cone.position.y = trunkH + k * 0.95;
      g.add(cone);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, 0.5, 8), this.snowCapMat);
      cap.position.y = trunkH + k * 0.95 + 0.62;
      g.add(cap);
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
    this.scene.add(g);
    this.trees.push(g);
    this.colliders.push({ x, z, y: h, r: 0.35 * s, top: h + 4, climbable: false });
  }

  scatterTrees() {
    let placed = 0;
    let tries = 0;
    while (placed < CONFIG.world.treeCount && tries < CONFIG.world.treeCount * 12) {
      tries++;
      const x = (Math.random() * 2 - 1) * this.bounds;
      const z = (Math.random() * 2 - 1) * this.bounds;
      const h = this.getHeight(x, z);
      if (h < this.waterLevel + 0.9 || h > 9.5) continue;
      if (Math.hypot(x, z) < 9) continue; // clareira da base
      this.makeTree(x, z);
      placed++;
    }
  }

  scatterRocks() {
    for (let i = 0; i < CONFIG.world.rockCount; i++) {
      const x = (Math.random() * 2 - 1) * this.bounds;
      const z = (Math.random() * 2 - 1) * this.bounds;
      const h = this.getHeight(x, z);
      if (h < this.waterLevel + 0.3 || Math.hypot(x, z) < 9) continue;
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
        top,
        climbable: true,
      });
    }
  }

  buildGrass() {
    const count = CONFIG.world.grassCount;
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
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        float wind = sin(uTime * 1.9 + transformed.x * 0.35 + transformed.z * 0.28) * 0.14;
        transformed.x += wind * (position.y * 1.8);
        `
      );
      mat.userData.shader = shader;
    };
    this.grassMat = mat;
    const grass = new THREE.InstancedMesh(tuft, mat, count);

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let i = 0;
    let tries = 0;
    while (i < count && tries < count * 8) {
      tries++;
      const x = (Math.random() * 2 - 1) * this.bounds;
      const z = (Math.random() * 2 - 1) * this.bounds;
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
    this.scene.add(grass);
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
    const count = CONFIG.world.fireflyCount;
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
    const count = CONFIG.world.snowCount;
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
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false })
    );
    this.scene.add(this.snow);
  }

  updateSnowfall(dt, elapsed, playerPos) {
    const p = playerPos || { x: 0, y: 4, z: 0 };
    const sp = this.snow.geometry.attributes.position;
    for (let i = 0; i < this.snowData.length; i++) {
      const d = this.snowData[i];
      let x = sp.getX(i) + Math.sin(elapsed * 1.1 + d.phase) * dt * 0.8;
      let y = sp.getY(i) - d.speed * dt;
      let z = sp.getZ(i) + Math.cos(elapsed * 0.9 + d.phase) * dt * 0.5;
      const dx = x - p.x;
      const dz = z - p.z;
      if (y < this.groundHeight(x, z) || dx * dx + dz * dz > 45 * 45) {
        x = p.x + (Math.random() * 2 - 1) * 40;
        z = p.z + (Math.random() * 2 - 1) * 40;
        y = p.y + 10 + Math.random() * 14;
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
    if (playerPos.distanceTo(g.position) > 2.8) return false;
    g.visible = false;
    return true;
  }

  // ------------------------------------------------------------------
  // BASE (fogueira + cabana + baú)
  // ------------------------------------------------------------------
  buildCampfire() {
    const g = new THREE.Group();
    const fx = 3;
    const fz = 2;
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

    this.scene.add(g);
    // fogueira: dá para subir nas pedras do fogo
    this.colliders.push({ x: fx, z: fz, y: fy, r: 0.7, top: fy + 0.55, climbable: true });
  }

  buildBase() {
    const bx = -4.5;
    const bz = -3;
    const by = this.getHeight(bx, bz);
    const g = new THREE.Group();
    g.position.set(bx, by, bz);
    this.basePos = g.position.clone();

    // cabana simples de madeira com telhado nevado
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), this.woodMat);
    body.position.y = 1.3;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.7, 4), this.woodDarkMat);
    roof.position.y = 3.35;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const roofSnow = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.7, 4), this.snowCapMat);
    roofSnow.position.y = 4.05;
    roofSnow.rotation.y = Math.PI / 4;
    g.add(roofSnow);
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
    // corpo da cabana (teto andável ~2.6m); cone do telhado fica acima
    this.colliders.push({
      x: bx,
      z: bz,
      y: by,
      r: 2.35,
      top: by + 2.6,
      climbable: true,
    });
    this.colliders.push({
      x: this.chestPos.x,
      z: this.chestPos.z,
      y: by,
      r: 0.55,
      top: by + 0.65,
      climbable: true,
    });
  }

  // ------------------------------------------------------------------
  // ITENS PARA DESCOBRIR
  // ------------------------------------------------------------------
  createItemMesh(color) {
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    crystal.position.y = 0.6;
    const halo = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.y = 0.6;
    g.add(crystal, halo);
    return g;
  }

  _spawnItemDef(def, { countsForWin = true, nearBase = false, saveId = null } = {}) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 60; tries++) {
      if (nearBase) {
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 18;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      } else {
        x = (Math.random() * 2 - 1) * this.bounds * 0.92;
        z = (Math.random() * 2 - 1) * this.bounds * 0.92;
      }
      const h = this.getHeight(x, z);
      const farFromBase = Math.hypot(x, z) > (nearBase ? 8 : 30);
      if (h > this.waterLevel + 0.6 && farFromBase) break;
    }
    const mesh = def.weaponId
      ? this.createWeaponPickupMesh(def.weaponId, def.color)
      : this.createItemMesh(def.color);
    const y = this.groundHeight(x, z) + 0.12;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.items.push({
      name: def.name,
      color: def.color,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      collected: false,
      discovered: !!def.weaponId || !!nearBase,
      phase: Math.random() * Math.PI * 2,
      weaponId: def.weaponId || null,
      ammoType: def.ammoType || null,
      ammoAmount: def.amount || 0,
      trapId: def.trapId || null,
      trapAmount: def.trapId ? def.amount || 1 : 0,
      countsForWin,
      saveId,
    });
  }

  buildItems() {
    this.items = [];
    let i = 0;
    for (const def of CONFIG.items) {
      this._spawnItemDef(def, { countsForWin: true, saveId: `win:${i++}` });
    }
    i = 0;
    for (const def of CONFIG.weaponPickups || []) {
      this._spawnItemDef(def, {
        countsForWin: false,
        nearBase: !!def.nearBase || def.weaponId === "torch",
        saveId: `wpn:${i++}`,
      });
    }
    i = 0;
    for (const def of CONFIG.ammoPickups || []) {
      this._spawnItemDef(def, { countsForWin: false, saveId: `ammo:${i++}` });
    }
    i = 0;
    for (const def of CONFIG.trapPickups || []) {
      this._spawnItemDef(def, { countsForWin: false, nearBase: true, saveId: `trap:${i++}` });
    }
    // vitória = itens de sobrevivência + troféu do urso alfa
    this.itemsTotal = CONFIG.items.length + 1;
  }

  nearestItem(playerPos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const it of this.items) {
      if (it.collected) continue;
      const d = playerPos.distanceTo(it.pos);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  collectItem(item) {
    item.collected = true;
    this.scene.remove(item.mesh);
  }

  updateItems(dt, elapsed, playerPos) {
    for (const it of this.items) {
      if (it.collected) continue;
      it.mesh.rotation.y = elapsed * 1.4 + it.phase;
      it.mesh.position.y = it.pos.y + Math.sin(elapsed * 2 + it.phase) * 0.12;
      if (!it.discovered && playerPos && playerPos.distanceTo(it.pos) < 22) {
        it.discovered = true;
        this._justDiscovered = it;
      }
    }
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
      const distPlayer = playerPos ? r.position.distanceTo(playerPos) : 99;
      const scared = distPlayer < 4.5;

      if (d.state === "idle") {
        d.timer -= dt * (scared ? 6 : 1);
        if (d.timer <= 0) {
          d.state = "hop";
          d.hopT = 0;
          d.speed = scared ? 3.4 : 1.6;
          if (scared && playerPos) {
            d.dir = Math.atan2(r.position.x - playerPos.x, r.position.z - playerPos.z) + (Math.random() - 0.5) * 0.6;
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
        if (nh > this.waterLevel + 0.5 && Math.abs(nx) < this.bounds && Math.abs(nz) < this.bounds) {
          r.position.x = nx;
          r.position.z = nz;
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
    this.bear = null;
    const hooks = {
      onAttack: (dmg, dir, enemy) => {
        this.onEnemyAttack?.(dmg, dir, enemy);
        this.onBearAttack?.(dmg, dir);
      },
      onEvent: (ev, enemy) => {
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
      case "werewolf":
        return createWerewolfMesh(this.tex);
      case "mula":
        return createMulaMesh(this.tex);
      case "slender":
        return createSlenderMesh();
      case "chuck":
        return createChuckMesh();
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
    const home = spawnPointFar(this, cfg.spawnMin || 48);
    const mesh = this._meshForEnemy(cfg);
    mesh.position.set(home.x, this.groundHeight(home.x, home.z), home.z);
    this.scene.add(mesh);
    const enemy = new Enemy(type, mesh, home, this);
    this.enemies.push(enemy);
    if (type === "bear_elite" || !this.bear) this.bear = enemy;
    this.onEnemySpawned?.(enemy);
    return enemy;
  }

  flushPendingEnemies(elapsed) {
    while (this.pendingEnemies.length && this.pendingEnemies[0].at <= elapsed) {
      const next = this.pendingEnemies.shift();
      this.spawnEnemyNow(next.type);
    }
  }

  updateEnemies(dt, elapsed, playerPos) {
    this.flushPendingEnemies(elapsed);
    for (const e of this.enemies) {
      e.update(dt, elapsed, playerPos, this._enemyHooks);
    }
  }

  /** Dano + morte/drops compartilhado por melee, tiros e explosões. */
  _applyDamage(enemy, dmg, opts = {}) {
    const result = enemy.takeDamage(dmg);
    if (opts.slowElite && enemy.type === "bear_elite") {
      enemy.applySlow(opts.slowElite);
    }
    if (result === "killed") {
      const dropPos = enemy.mesh.position.clone();
      dropPos.y = this.groundHeight(dropPos.x, dropPos.z);
      if (enemy.cfg.dropsTrophy) {
        this.spawnGroundLoot({
          name: "Troféu do Urso Alfa",
          color: 0xffd75a,
          pos: dropPos,
          countsForWin: true,
          discovered: true,
          saveId: "win:trophy",
        });
      }
      // loot de armas/munição
      const looted = this.rollEnemyDrops(enemy, dropPos);
      enemy._lastDrops = looted;
      this.onEnemyEvent?.("dead", enemy);
      this.onBearEvent?.("dead");
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
      if (!e.alive) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return null;
    return this._applyDamage(best, dmg, opts);
  }

  /** Dano em área (granada): atinge todos no raio, com queda linear. */
  damageEnemiesInRadius(pos, dmg, radius) {
    const hit = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.6;
      this._applyDamage(e, Math.round(dmg * falloff));
      hit.push(e);
    }
    return hit;
  }

  /**
   * Tiro instantâneo (raycast simplificado): inimigo mais próximo ao longo do raio.
   * @returns {{ enemy, dist } | null}
   */
  hitscan(origin, dir, dmg, maxDist = 50, opts = {}) {
    let best = null;
    let bestT = maxDist;
    const v = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive) continue;
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
    this._spawnTracer(origin, dir, best ? bestT : Math.min(maxDist, 40));
    if (!best) return null;
    this._applyDamage(best, dmg, opts);
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
  spawnProjectile({ pos, dir, speed, damage, kind = "arrow", fuse = 0, explodeRadius = 0, slowElite = 0 }) {
    let mesh;
    if (kind === "grenade") {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a4a34, roughness: 0.8 })
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.55, 5),
        new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.9 })
      );
      // aponta o eixo Y do cilindro na direção do voo
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
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
      ttl: 6,
      resting: false,
    });
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

  updateProjectiles(dt) {
    const gravity = 14;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.explodeAt(p.mesh.position.clone(), p.damage, p.explodeRadius || 5);
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.ttl <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.resting) continue;

      p.vel.y -= gravity * dt * (p.kind === "grenade" ? 1.3 : 0.55);
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind !== "grenade") {
        const dirN = p.vel.clone().normalize();
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN);
      }

      // impacto em inimigo (só flechas — granada explode pelo fuse)
      if (p.kind !== "grenade") {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const center = e.mesh.position.clone();
          center.y += 0.9 * (e.cfg.scale || 1);
          const hitR = 0.9 * (e.cfg.scale || 1) + 0.35;
          if (p.mesh.position.distanceTo(center) < hitR) {
            this._applyDamage(e, p.damage, { slowElite: p.slowElite });
            this.onProjectileHit?.(e);
            this.scene.remove(p.mesh);
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
    const got = [];
    let i = 0;
    for (const row of table) {
      if (Math.random() > (row.chance ?? 1)) continue;
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
        ammoAmount: row.amount || 0,
        trapId: row.trapId || null,
        trapAmount: row.trapId ? row.amount || 1 : 0,
        countsForWin: false,
        discovered: true,
      });
      got.push(row.weaponId || row.ammoType || row.trapId);
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
    countsForWin = false,
    discovered = true,
    saveId = null,
  }) {
    const mesh = weaponId
      ? this.createWeaponPickupMesh(weaponId, color)
      : this.createItemMesh(color);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({
      name,
      color,
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
      countsForWin,
      saveId: saveId || `dyn:${name}:${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  /** Pickup visual distinto para armas (não o cristal genérico). */
  createWeaponPickupMesh(weaponId, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: color ?? 0xc8d0d8,
      roughness: 0.55,
      metalness: 0.35,
      emissive: color ?? 0xc8d0d8,
      emissiveIntensity: 0.22,
    });
    const w = CONFIG.weapons[weaponId];
    const fire = w?.fire;
    if (fire === "hitscan" || weaponId === "ak47" || weaponId === "revolver" || weaponId === "shotgun") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), mat);
      body.position.y = 0.2;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), mat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.24, 0.4);
      g.add(body, barrel);
    } else if (fire === "projectile" || weaponId === "bow" || weaponId === "crossbow") {
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 14, Math.PI), mat);
      limb.rotation.y = Math.PI / 2;
      limb.position.y = 0.4;
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4),
        new THREE.MeshBasicMaterial({ color: 0xf0e8d8 })
      );
      string.position.y = 0.4;
      const arrow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.55, 5),
        new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.4, 0.2);
      g.add(limb, string, arrow);
    } else if (weaponId === "grenade") {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat));
    } else {
      // melee: lâmina
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.04), mat);
      blade.position.y = 0.4;
      const hilt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 })
      );
      hilt.position.y = 0.1;
      g.add(blade, hilt);
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
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
      if (!e.alive) continue;
      const d = e.mesh.position.distanceTo(playerPos);
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
        return { chasing: true, dist: e.mesh.position.distanceTo(playerPos) };
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
    if (this.grassMat?.userData.shader) {
      this.grassMat.userData.shader.uniforms.uTime.value = elapsed;
    }
    for (const tree of this.trees) {
      tree.rotation.z = Math.sin(elapsed * 0.9 + tree.userData.phase) * 0.03;
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
  }

  // ------------------------------------------------------------------
  // ARMADILHAS (mina / isca / cerca) — só perto da base
  // ------------------------------------------------------------------
  createTrapMesh(type) {
    const g = new THREE.Group();
    if (type === "mine") {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.5, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, metalness: 0.4 })
      );
      disc.position.y = 0.06;
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3030 })
      );
      led.position.y = 0.16;
      g.add(disc, led);
      g.userData.led = led;
    } else if (type === "bait") {
      const meat = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.2, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb05030, roughness: 0.9 })
      );
      meat.position.y = 0.12;
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 })
      );
      bone.rotation.z = Math.PI / 2;
      bone.position.y = 0.14;
      g.add(meat, bone);
    } else {
      // fence: postes + ripas
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 1 });
      for (const dx of [-0.7, 0.7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), wood);
        post.position.set(dx, 0.7, 0);
        g.add(post);
      }
      for (const y of [0.4, 0.85]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.1), wood);
        rail.position.set(0, y, 0);
        g.add(rail);
      }
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return g;
  }

  /**
   * Coloca armadilha em (x,z). Retorna false se inválido.
   */
  placeTrap(type, x, z) {
    const cfg = CONFIG.traps[type];
    if (!cfg) return false;
    const maxD = CONFIG.trapPlaceMaxDist || 35;
    if (this.campfirePos.distanceTo(new THREE.Vector3(x, 0, z)) > maxD) return false;

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
        top: y + 1.4,
        climbable: false,
        temporary: true,
      };
      this.colliders.push(col);
      trap.collider = col;
    }

    if (type === "bait") {
      // atrai o inimigo vivo mais próximo
      let best = null;
      let bestD = cfg.lureRadius || 28;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = e.mesh.position.distanceTo(trap.pos);
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
        if (led) led.material.opacity = 0.5 + Math.sin(performance.now() * 0.01) * 0.5;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (e.mesh.position.distanceTo(t.pos) < (t.cfg.triggerRadius || 2.8)) {
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
            if (!e.alive) continue;
            if (e.mesh.position.distanceTo(t.pos) < (t.cfg.lureRadius || 28)) {
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
    return new THREE.Vector3(0, this.groundHeight(0, 0), 0);
  }

  clampToBounds(v) {
    v.x = THREE.MathUtils.clamp(v.x, -this.bounds, this.bounds);
    v.z = THREE.MathUtils.clamp(v.z, -this.bounds, this.bounds);
  }

  /**
   * Altura do chão sob (x,z): terreno + topo de objetos climbable.
   * feetY = altura atual dos pés (para step-up / continuar em cima).
   */
  supportHeight(x, z, feetY, radius = CONFIG.player.radius, stepHeight = CONFIG.player.stepHeight) {
    let y = this.groundHeight(x, z);
    for (const c of this.colliders) {
      if (!c.climbable || c.top == null) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      // um pouco além do raio para não cair no canto da pedra
      const reach = c.r + radius * 0.55;
      if (dx * dx + dz * dz > reach * reach) continue;
      const top = c.top;
      const onTop = feetY >= top - 0.35;
      const canStep = top - feetY <= stepHeight + 0.1;
      if (onTop || canStep) y = Math.max(y, top);
    }
    return y;
  }

  /**
   * Resolve paredes e step-up. Retorna true se o player subiu num obstáculo.
   */
  collide(p, radius, stepHeight = CONFIG.player.stepHeight) {
    let stepped = false;
    for (const c of this.colliders) {
      const top = c.top ?? c.y + 3;
      // já em cima: não empurra (fica andando no topo)
      if (c.climbable && p.y >= top - 0.2) continue;
      // bem acima (pulo por cima): ignora
      if (p.y > top + 0.5) continue;

      const dx = p.x - c.x;
      const dz = p.z - c.z;
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
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
    }
    return stepped;
  }
}
