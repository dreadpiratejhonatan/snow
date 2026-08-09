import * as THREE from "three";
import { CONFIG } from "./config.js";
import { getSkin, loadFaceTexture, resolveSkinId } from "./skins.js";
import { buildHeldWeaponMesh } from "./weaponVisuals.js";

/** Menor giro de `from` → `to` em radianos (−π..π). */
function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Player {
  constructor(camera, scene, world, spawn) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.moveVel = new THREE.Vector3(); // velocidade de movimento (suavizada no gelo)
    this.kb = new THREE.Vector3(); // knockback (empurrão do urso)
    this.yaw = 0;
    this.pitch = 0;
    /** Órbita só da câmera em 3ª pessoa (0 = atrás do corpo). */
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    /** Corpo em 3ª pessoa: vira na direção do passo (estilo Spirit) — dá pra ver o rosto. */
    this._bodyYaw = Math.PI;
    this.onGround = false;
    this.cameraMode = "first";
    this.skinId = "natan";
    this.aiming = false;
    this._aimCamDist = CONFIG.thirdPerson?.distance ?? 4.8;
    /** Montado: MountManager controla posição; pose de sentar nas pernas. */
    this.riding = false;
    this.mountMoving = false;
    this.buildMesh();
  }

  applyKnockback(dir, force) {
    this.kb.x += dir.x * force;
    this.kb.z += dir.z * force;
  }

  /** Aplica paleta + textura de rosto (CONFIG.skins). */
  applySkin(skinId) {
    const def = getSkin(skinId);
    this.skinId = def.id;
    if (!this.mats) return;
    this.mats.suit.color.setHex(def.suit);
    this.mats.shirt.color.setHex(def.shirt);
    this.mats.skin.color.setHex(def.skin);
    this.mats.tie.color.setHex(def.tie);
    const faceMat = this.mats.face;
    if (faceMat && def.face) {
      const token = def.id;
      loadFaceTexture(def.face).then((tex) => {
        if (this.skinId !== token || !tex) return;
        faceMat.map = tex;
        faceMat.color.setHex(0xffffff);
        faceMat.needsUpdate = true;
      });
    }
  }

  buildMesh() {
    const def = getSkin(this.skinId);
    // formas arredondadas (cilindros/esferas) em vez de caixas
    const suit = new THREE.MeshStandardMaterial({ color: def.suit, roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ color: def.shirt, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: def.skin, roughness: 0.55 });
    const tie = new THREE.MeshStandardMaterial({ color: def.tie, roughness: 0.7 });
    const face = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0,
      side: THREE.FrontSide,
    });
    this.mats = { suit, shirt, skin, tie, face };

    this.mesh = new THREE.Group();

    // torso afunilado (ombros mais largos que a cintura)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.72, 12), suit);
    torso.position.y = 1.28;

    // ombros arredondados
    const shoulderGeo = new THREE.SphereGeometry(0.075, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, suit);
    leftShoulder.position.set(-0.19, 1.6, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, suit);
    rightShoulder.position.set(0.19, 1.6, 0);

    // camisa e gravata na frente do peito
    const shirtStrip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.6, 8), shirt);
    shirtStrip.position.set(0, 1.32, 0.13);
    const tieStrip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.34, 6), tie);
    tieStrip.rotation.x = Math.PI;
    tieStrip.position.set(0, 1.36, 0.16);

    // headRoot: pescoço + cabeça + rosto giram com o olhar (contrato Spirit / celular)
    this.headRoot = new THREE.Group();
    this.headRoot.position.y = 1.68;
    this.headRoot.rotation.order = "YXZ";
    this._headYaw = 0;
    this._headPitch = 0;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 8), skin);
    neck.position.y = 0;

    // Cabeça só pele; rosto = plano na frente (+Z, mesmo lado da camisa).
    // mesh.rotation.y = yaw+π → +Z aponta no olhar; 3ª pessoa (atrás) vê nuca, não o plano.
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skin);
    head.position.y = 0.2;
    this.headMesh = head;

    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.28), face);
    facePlane.position.set(0, 0.2, 0.152);
    this.facePlane = facePlane;
    this.headRoot.add(neck, head, facePlane);

    this.leftLeg = this.makeLimb(0.07, 0.95, suit, 0.05);
    this.leftLeg.position.set(-0.09, 0.95, 0);
    this.rightLeg = this.makeLimb(0.07, 0.95, suit, 0.05);
    this.rightLeg.position.set(0.09, 0.95, 0);

    this.leftArm = this.makeLimb(0.05, 1.0, suit, 0.04, skin);
    this.leftArm.position.set(-0.23, 1.58, 0);
    this.rightArm = this.makeLimb(0.05, 1.0, suit, 0.04, skin);
    this.rightArm.position.set(0.23, 1.58, 0);

    // ponto de ancoragem da arma na mão direita (3ª pessoa)
    this.weaponMount = new THREE.Group();
    this.weaponMount.position.set(0, -0.95, 0.08);
    this.rightArm.add(this.weaponMount);
    this.heldWeapon = null;
    this.attackAnim = 0;
    this.weaponIdHeld = "fists";

    // viewmodel 1ª pessoa (filho da câmera — sempre visível ao equipar)
    this.fpWeaponRoot = new THREE.Group();
    this.fpWeaponRoot.position.set(0.28, -0.28, -0.55);
    this.camera.add(this.fpWeaponRoot);
    this.fpWeapon = null;

    this.tentacles = [];
    for (let i = 0; i < 4; i++) {
      const t = this.makeLimb(0.03, 1.25, suit, 0.015);
      const side = i < 2 ? -1 : 1;
      t.position.set(side * (0.06 + (i % 2) * 0.08), 1.52, -0.13);
      this.tentacles.push(t);
      this.mesh.add(t);
    }

    this.mesh.add(
      torso,
      leftShoulder,
      rightShoulder,
      shirtStrip,
      tieStrip,
      this.headRoot,
      this.leftLeg,
      this.rightLeg,
      this.leftArm,
      this.rightArm
    );
    this.mesh.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    this.scene.add(this.mesh);

    this.walkPhase = 0;
    this.walkAmp = 0;
    this.syncMesh();
    // textura do personagem default
    this.applySkin(resolveSkinId(this.skinId));
  }

  // membro cilíndrico afunilado com ponta arredondada; `tipMat` opcional (mãos)
  makeLimb(rTop, h, material, rBottom, tipMat) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 8), material);
    mesh.position.y = -h / 2;
    group.add(mesh);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(rBottom * 1.3, 8, 6), tipMat || material);
    tip.position.y = -h;
    group.add(tip);
    return group;
  }

  /** Troca o mesh da arma na mão (3ª pessoa + viewmodel 1ª pessoa). */
  setHeldWeapon(weaponId) {
    const id = weaponId || "fists";
    if (this.weaponIdHeld === id) {
      // garante que os meshes existam (ex.: após rebuild)
      if (id === "fists" || (this.heldWeapon && this.fpWeapon)) {
        this.syncFpWeaponVisibility();
        return;
      }
    }
    this.weaponIdHeld = id;

    if (this.heldWeapon) {
      this.weaponMount.remove(this.heldWeapon);
      this.heldWeapon = null;
    }
    if (this.fpWeapon) {
      this.fpWeaponRoot.remove(this.fpWeapon);
      this.fpWeapon = null;
    }

    if (id === "fists") {
      this.syncFpWeaponVisibility();
      return;
    }

    this.heldWeapon = buildHeldWeaponMesh(id);
    this.weaponMount.add(this.heldWeapon);
    this._heldWeaponBase = this.heldWeapon.position.clone();

    // viewmodel maior, à frente da câmera
    this.fpWeapon = buildHeldWeaponMesh(id);
    this.fpWeapon.scale.multiplyScalar(1.35);
    if (id === "spear") {
      this.fpWeapon.rotation.set(-1.15, 0.35, 0.12);
      this.fpWeapon.position.set(0.04, -0.08, 0.05);
    } else {
      this.fpWeapon.rotation.set(-0.35, 0.35, 0.1);
      this.fpWeapon.position.set(0, 0, 0);
    }
    this.fpWeaponRoot.add(this.fpWeapon);
    this.syncFpWeaponVisibility();
  }

  syncFpWeaponVisibility() {
    if (!this.fpWeaponRoot) return;
    // 1ª pessoa: mostra arma na câmera; 3ª: no corpo
    this.fpWeaponRoot.visible = this.cameraMode === "first" && this.weaponIdHeld !== "fists";
  }

  /** Dispara animação de ataque (braço + torso + viewmodel). */
  playAttack(kind = "melee") {
    this.attackAnim = kind === "melee" ? 1 : 0.7;
    this.attackKind = kind;
  }

  animateLimbs(dt, moving) {
    if (!this.leftLeg) return;

    // Pose de sela: joelhos dobrados a cavalo; braços atacam / miram na montaria.
    // Evita o corpo em pé atravessando o lombo do animal (pele sobre pele).
    if (this.riding) {
      if (moving) this.walkPhase += dt * 7;
      const bob = moving ? Math.sin(this.walkPhase) * 0.07 : 0;
      this.walkAmp = moving ? 0.35 : 0;
      this.leftLeg.rotation.x = -1.2 + bob;
      this.rightLeg.rotation.x = -1.2 - bob;
      this.leftLeg.rotation.z = 0.28;
      this.rightLeg.rotation.z = -0.28;
      if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3.5);
      const atk = this.attackAnim;
      const punch = Math.sin((1 - atk) * Math.PI) * (atk > 0 ? 1 : 0);
      const holding = this.weaponIdHeld && this.weaponIdHeld !== "fists";
      const ranged =
        holding &&
        (CONFIG.weapons[this.weaponIdHeld]?.fire === "hitscan" ||
          CONFIG.weapons[this.weaponIdHeld]?.fire === "projectile" ||
          CONFIG.weapons[this.weaponIdHeld]?.fire === "thrown");
      const bowLike = this.weaponIdHeld === "bow" || this.weaponIdHeld === "crossbow";
      const readyR = holding ? (bowLike ? 1.05 : ranged ? 0.85 : 0.7) : 0.55;
      const readyL = bowLike ? 0.95 : holding && ranged ? 0.45 : 0.35;
      this.leftArm.rotation.x = -readyL - (bowLike ? punch * 0.35 : 0);
      this.leftArm.rotation.z = bowLike ? 0.3 : 0.12;
      this.rightArm.rotation.x = -readyR - punch * (ranged ? 0.85 : 1.45);
      this.rightArm.rotation.z = punch * (ranged ? 0.12 : 0.35) + (holding ? 0.08 : 0);
      if (this.mesh) {
        this.mesh.rotation.x = 0.08 - punch * 0.08;
        this.mesh.rotation.z = 0;
      }
      for (const t of this.tentacles) {
        t.visible = false;
      }
      if (this.fpWeaponRoot) this.syncFpWeaponVisibility();
      if (this.weaponMount) {
        this.weaponMount.rotation.x = -punch * (ranged ? 0.35 : 0.7);
        this.weaponMount.rotation.y = 0;
      }
      return;
    }

    // Volta a abrir as pernas / tentáculos após desmontar
    this.leftLeg.rotation.z *= 0.7;
    this.rightLeg.rotation.z *= 0.7;
    for (const t of this.tentacles) t.visible = true;

    this.walkPhase += dt * 9;
    const target = moving ? 0.7 : 0;
    this.walkAmp += (target - this.walkAmp) * Math.min(1, dt * 10);
    const swing = Math.sin(this.walkPhase) * this.walkAmp;

    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3.5);
    const atk = this.attackAnim;
    const punch = Math.sin((1 - atk) * Math.PI) * (atk > 0 ? 1 : 0);
    const holding = this.weaponIdHeld && this.weaponIdHeld !== "fists";
    const ranged =
      holding &&
      (CONFIG.weapons[this.weaponIdHeld]?.fire === "hitscan" ||
        CONFIG.weapons[this.weaponIdHeld]?.fire === "projectile");
    const bowLike = this.weaponIdHeld === "bow" || this.weaponIdHeld === "crossbow";

    const spearLike = this.weaponIdHeld === "spear";

    // pose de pronto: lança com braço mais alto (estocada), não pendurada no torso
    const readyR = holding
      ? spearLike
        ? 1.25
        : bowLike
          ? 1.05
          : ranged
            ? 0.85
            : 0.55
      : 0;
    const readyL = bowLike ? 0.95 : holding && ranged ? 0.45 : 0;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -readyL - swing * (holding ? 0.25 : 0.8) - (bowLike ? punch * 0.4 : 0);
    this.leftArm.rotation.z = bowLike ? 0.35 : 0;
    // braço direito: hold + golpe / recoil (lança = estocada, não golpe de cima)
    this.rightArm.rotation.x =
      -readyR + swing * (holding ? 0.15 : 0.8) - punch * (spearLike ? 0.55 : ranged ? 0.9 : 1.7);
    this.rightArm.rotation.z =
      punch * (spearLike ? 0.04 : ranged ? 0.15 : 0.5) + (holding ? (spearLike ? 0.06 : 0.12) : 0);
    // estocada: avança a partir da pose base (não sobrescreve X/Y)
    if (spearLike && this.heldWeapon) {
      const base = this._heldWeaponBase || { x: 0.08, y: 0.02, z: 0.14 };
      this.heldWeapon.position.set(base.x, base.y, base.z + punch * 0.5);
    }
    if (this.mesh) {
      this.mesh.rotation.x = -punch * 0.12;
      this.mesh.rotation.z = punch * 0.08;
    }

    // kick do viewmodel
    if (this.fpWeaponRoot) {
      const kick = punch * (ranged ? 0.12 : 0.22);
      this.fpWeaponRoot.position.set(0.28, -0.28 + kick * 0.3, -0.55 + kick);
      this.fpWeaponRoot.rotation.x = -kick * 1.2;
      this.syncFpWeaponVisibility();
    }

    // 3ª pessoa: arma aponta com a câmera/órbita (não só com o corpo)
    if (this.weaponMount && ranged && this.cameraMode === "third") {
      const aimPull = this.aiming ? 1 : 0.85;
      this.weaponMount.rotation.order = "YXZ";
      this.weaponMount.rotation.y = this.orbitYaw * aimPull;
      this.weaponMount.rotation.x = this.cameraPitch * 0.65 * aimPull;
    } else if (this.weaponMount) {
      this.weaponMount.rotation.x = 0;
      this.weaponMount.rotation.y = 0;
    }

    const sway = Math.sin(this.walkPhase * 0.5) * 0.18;
    for (let i = 0; i < this.tentacles.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.tentacles[i].rotation.x = -0.25 + sway * dir + punch * 0.2;
      this.tentacles[i].rotation.z = sway * dir * 0.5;
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode === "third" ? "third" : "first";
    if (this.cameraMode === "first") this.resetOrbit();
    this.syncMesh();
    this.syncFpWeaponVisibility();
    this.syncCamera();
  }

  resetOrbit() {
    this.orbitYaw = 0;
    this.orbitPitch = 0;
  }

  /** true se a câmera está mais na frente do personagem (vê o rosto). */
  isOrbitFront() {
    const y = ((this.orbitYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return y > Math.PI * 0.5 && y < Math.PI * 1.5;
  }

  /** Alterna vista de frente (rosto) ↔ costas. */
  toggleOrbitFrontView() {
    if (this.isOrbitFront()) this.resetOrbit();
    else {
      this.orbitYaw = Math.PI;
      this.orbitPitch = 0;
    }
    this.syncCamera();
    return this.isOrbitFront();
  }

  reset(spawn) {
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.moveVel.set(0, 0, 0);
    this.kb.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this._bodyYaw = Math.PI;
    this.resetOrbit();
    this.onGround = false;
    this.riding = false;
    this.mountMoving = false;
    this.syncMesh();
    this.syncCamera();
  }

  applyLook(delta, sensMul = 1) {
    const sensitivity = 0.0034 * sensMul;
    this.yaw -= delta.x * sensitivity;
    this.pitch -= delta.y * sensitivity;
    // yaw livre 360°; pitch quase no zenite/chão
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
    // evita drift numérico após muitas voltas
    if (this.yaw > Math.PI * 4 || this.yaw < -Math.PI * 4) {
      this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }
  }

  /** Gira só a câmera em volta do corpo (3ª pessoa) — não vira o personagem. */
  applyOrbitLook(delta) {
    const sensitivity = 0.0034;
    this.orbitYaw -= delta.x * sensitivity;
    this.orbitPitch -= delta.y * sensitivity;
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch, -1.2, 1.2);
    if (this.orbitYaw > Math.PI * 4 || this.orbitYaw < -Math.PI * 4) {
      this.orbitYaw =
        ((this.orbitYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }
  }

  /** Look contínuo por teclado (não usa setas — elas movem o personagem). */
  applyKeyboardLook(dt, input) {
    const speed = 1.85; // rad/s
    let dx = 0;
    let dy = 0;
    // IJKL = olhar sem mouse (I cima, K baixo, J esquerda, L direita); U = alias de I
    if (input.isDown("KeyJ")) dx -= 1;
    if (input.isDown("KeyL")) dx += 1;
    if (input.isDown("KeyI", "KeyU")) dy -= 1;
    if (input.isDown("KeyK")) dy += 1;
    if (!dx && !dy) return;
    this.applyLook({ x: dx * speed * dt * 280, y: dy * speed * dt * 280 });
  }

  /** Alt + setas: orbita a câmera 360° sem mouse e sem girar o corpo. */
  applyOrbitKeys(dt, input) {
    const speed = 1.85;
    let dx = 0;
    let dy = 0;
    if (input.orbitLeft) dx -= 1;
    if (input.orbitRight) dx += 1;
    if (input.orbitUp) dy -= 1;
    if (input.orbitDown) dy += 1;
    if (!dx && !dy) return;
    this.applyOrbitLook({ x: dx * speed * dt * 280, y: dy * speed * dt * 280 });
  }

  get cameraYaw() {
    return this.yaw + this.orbitYaw;
  }

  get cameraPitch() {
    return THREE.MathUtils.clamp(this.pitch + this.orbitPitch, -1.55, 1.55);
  }

  update(dt, input) {
    const cfg = CONFIG.player;

    // Montado: a sela (MountManager) manda na posição. Sem gravidade/chão
    // senão o corpo cai e atravessa o animal (pele sobre pele).
    if (this.riding) {
      this.moveVel.set(0, 0, 0);
      this.velocity.set(0, 0, 0);
      this.kb.set(0, 0, 0);
      this.onGround = true;
      // mira/ADS liberados na montaria — MountManager já alinhou _bodyYaw ao animal
      const cam = CONFIG.camera || {};
      const aiming =
        !!input.rightDown && !input.orbitModifier && !input.mobile && !input.blockAim;
      this.aiming = aiming;
      const fovZoom =
        aiming && (!cam.aimFirstPersonOnly || this.cameraMode === "first");
      const targetFov = fovZoom
        ? cam.fovAim ?? 46
        : cam.fov ?? 75;
      const fovLerp = fovZoom ? (cam.fovLerp ?? 10) : 6;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * fovLerp);
      this.camera.updateProjectionMatrix();
      this.animateLimbs(dt, !!this.mountMoving);
      this.syncMesh();
      this.syncCamera(dt);
      return;
    }

    const onIce = this.world.isOnIce(this.position.x, this.position.z);
    const speed = input.sprint ? cfg.sprintSpeed : cfg.walkSpeed;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();

    // joystick analógico no celular; teclado digital no desktop
    if (input.analog && (Math.abs(input.analog.x) > 0.05 || Math.abs(input.analog.y) > 0.05)) {
      wish.addScaledVector(forward, input.analog.y);
      wish.addScaledVector(right, input.analog.x);
      const mag = Math.min(1, wish.length());
      if (mag > 0) wish.multiplyScalar((speed * mag) / wish.length());
    } else {
      if (input.moveForward) wish.add(forward);
      if (input.moveBack) wish.sub(forward);
      if (input.moveLeft) wish.sub(right);
      if (input.moveRight) wish.add(right);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    }

    // Spirit: corpo olha para onde anda — ao “voltar”, gira e mostra o rosto/skin
    const lookFacing = this.cameraYaw + Math.PI;
    let targetBody = lookFacing;
    const wishMoving = wish.lengthSq() > 0.0001;
    if (wishMoving) {
      targetBody = Math.atan2(wish.x, wish.z);
    }
    const turnSpeed = wishMoving ? 12 : 7;
    this._bodyYaw += shortestAngleDelta(this._bodyYaw, targetBody) * Math.min(1, dt * turnSpeed);

    // no gelo a aceleração é baixa: derrapa ao mudar de direção
    const accel = onIce ? 2.4 : 25;
    this.moveVel.x += (wish.x - this.moveVel.x) * Math.min(1, dt * accel);
    this.moveVel.z += (wish.z - this.moveVel.z) * Math.min(1, dt * accel);

    // knockback decai com o tempo
    this.kb.multiplyScalar(Math.exp(-dt * 5));

    this.velocity.x = this.moveVel.x + this.kb.x;
    this.velocity.z = this.moveVel.z + this.kb.z;

    if (input.jump && this.onGround) {
      this.velocity.y = cfg.jumpForce;
      this.onGround = false;
    }

    // 1) movimento horizontal — coords contínuas (toro visual sem teleporte)
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // 2) step-up / paredes (antes da gravidade, senão “desce” no mesmo frame)
    const stepped = this.world.collide(this.position, cfg.radius, cfg.stepHeight);
    if (stepped) {
      this.velocity.y = 0;
      this.onGround = true;
    }

    // 3) gravidade
    this.velocity.y -= cfg.gravity * dt;
    this.velocity.y = Math.max(this.velocity.y, -50);
    this.position.y += this.velocity.y * dt;

    // 4) pousa no terreno ou topo de pedra/cabana/baú
    const groundY = this.world.supportHeight(
      this.position.x,
      this.position.z,
      this.position.y,
      cfg.radius,
      cfg.stepHeight
    );
    if (this.position.y <= groundY + 0.02) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = horizontalSpeed > 0.5;
    this.animateLimbs(dt, moving);

    // ADS (botão direito): zoom no crosshair. Alt/órbita não ativa mira.
    const cam = CONFIG.camera || {};
    const aiming =
      !!input.rightDown && !input.orbitModifier && !input.mobile && !input.blockAim;
    this.aiming = aiming;
    const fovZoom =
      aiming &&
      (!cam.aimFirstPersonOnly || this.cameraMode === "first");
    const targetFov = fovZoom
      ? cam.fovAim ?? 46
      : input.sprint && moving
        ? cam.fovSprint ?? 82
        : cam.fov ?? 75;
    const fovLerp = fovZoom ? (cam.fovLerp ?? 10) : 6;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * fovLerp);
    this.camera.updateProjectionMatrix();

    this.syncMesh();
    this.syncCamera(dt);
  }

  syncMesh() {
    this.mesh.visible = this.cameraMode === "third";
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    // _bodyYaw no espaço do mesh (frente = +Z = direção do passo / olhar)
    this.mesh.rotation.y = this._bodyYaw ?? this.yaw + Math.PI;
  }

  /** Cabeça acompanha o olhar da câmera (pitch>0 = olhar pra cima). */
  syncHeadLook(dt = 0) {
    if (!this.headRoot) return;
    // olhar da câmera no mesmo espaço do corpo; corpo pode estar virado pro passo
    const lookFacing = this.cameraYaw + Math.PI;
    const bodyYaw = this._bodyYaw ?? this.yaw + Math.PI;
    const targetYaw = THREE.MathUtils.clamp(shortestAngleDelta(bodyYaw, lookFacing), -0.85, 0.85);
    // cameraPitch>0 = cima; headRoot.rotation.x positivo no Three olha pra baixo → invertido
    const targetPitch = THREE.MathUtils.clamp(-this.cameraPitch, -1.15, 1.15);
    const k = Math.min(1, (dt || 1 / 60) * 14);
    this._headYaw += (targetYaw - this._headYaw) * k;
    this._headPitch += (targetPitch - this._headPitch) * k;
    this.headRoot.rotation.y = this._headYaw;
    this.headRoot.rotation.x = this._headPitch;
  }

  syncCamera(dt = 0) {
    this.syncHeadLook(dt);
    if (this.cameraMode === "third") {
      this.syncThirdPersonCamera(dt);
      return;
    }
    // head bob sutil ao caminhar (usa a mesma fase da animação das pernas)
    const bob = this.onGround ? Math.sin(this.walkPhase * 2) * 0.05 * this.walkAmp : 0;
    this.camera.position.set(
      this.position.x,
      this.position.y + CONFIG.player.eyeHeight + bob,
      this.position.z
    );
    // pitch>0 = olhar pra cima (mesmo sentido da 3ª pessoa); Three +X olha pra baixo
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = -this.pitch;
  }

  /**
   * Órbita estilo Spirit: olhar pra baixo sobe a câmera por cima da cabeça
   * para ver os pés, sem enterrar no terreno.
   */
  syncThirdPersonCamera(dt = 0) {
    const cfg = CONFIG.thirdPerson;
    const camCfg = CONFIG.camera || {};
    const camYaw = this.cameraYaw;
    const camPitch = this.cameraPitch;
    const feetY = this.position.y;
    const pivotY = feetY + (cfg.pivotHeight ?? 1.5);
    const wantDist =
      cfg.distance * (this.aiming ? camCfg.aimDistanceMul ?? 0.68 : 1);
    this._aimCamDist ??= cfg.distance;
    this._aimCamDist += (wantDist - this._aimCamDist) * Math.min(1, dt * 8);
    const dist = this._aimCamDist;

    // pitch>0 olhar pra cima → câmera desce; pitch<0 olhar pra baixo → sobe (overhead)
    let horiz = Math.cos(camPitch) * dist;
    if (horiz < 0.55) horiz = 0.55;
    let camY = pivotY - Math.sin(camPitch) * dist;
    const minCamY = feetY + 0.42;
    if (camY < minCamY) {
      camY = minCamY;
      const rise = pivotY - camY;
      const maxHoriz = Math.sqrt(Math.max(0.3, dist * dist - rise * rise));
      horiz = Math.min(horiz, Math.max(0.55, maxHoriz));
    }

    // ombro leve + posição atrás do corpo na direção da câmera
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const target = new THREE.Vector3(
      this.position.x + Math.sin(camYaw) * horiz,
      camY,
      this.position.z + Math.cos(camYaw) * horiz
    );
    target.addScaledVector(right, cfg.shoulderOffset ?? 0.42);

    // não atravessar o chão sob a câmera
    const gh = this.world.groundHeight(target.x, target.z);
    if (target.y < gh + 0.4) target.y = gh + 0.4;

    if (dt > 0 && this._camSmooth) {
      this._camSmooth.lerp(target, 1 - Math.exp(-dt * 16));
    } else {
      this._camSmooth = target.clone();
    }
    this.camera.position.copy(this._camSmooth);

    // mira: ao olhar pra baixo, aponta mais pros pés
    const lookDown = Math.max(0, -camPitch);
    const aimAhead = 2.2 * (1 - lookDown * 0.55);
    const aimY = THREE.MathUtils.lerp(pivotY, feetY + 0.08, Math.min(1, lookDown / 1.2));
    this._lookTarget ??= new THREE.Vector3();
    this._lookTarget.set(
      this.position.x - Math.sin(camYaw) * aimAhead,
      aimY,
      this.position.z - Math.cos(camYaw) * aimAhead
    );
    this.camera.lookAt(this._lookTarget);
  }

  get eyePosition() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + CONFIG.player.eyeHeight,
      this.position.z
    );
  }

  get lookDirection() {
    const cosP = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosP
    ).normalize();
  }

  /** Direção da câmera (crosshair) — inclui órbita 3ª pessoa. */
  get cameraLookDirection() {
    const yaw = this.cameraYaw;
    const pitch = this.cameraPitch;
    const cosP = Math.cos(pitch);
    return new THREE.Vector3(
      -Math.sin(yaw) * cosP,
      Math.sin(pitch),
      -Math.cos(yaw) * cosP
    ).normalize();
  }

  /**
   * Origem + direção alinhadas à crosshair (câmera).
   * Em 3ª pessoa dispara perto do raio da câmera para não “sair torto” do ombro.
   */
  getAimFire(world, range = 80) {
    const eye = this.eyePosition;
    const camDir = this.cameraLookDirection;
    const camPos = this.camera?.position
      ? this.camera.position.clone()
      : eye.clone();
    const maxDist = Math.max(8, Number(range) || 80);
    const aimPoint = world?.rayAimPoint
      ? world.rayAimPoint(camPos, camDir, maxDist)
      : camPos.clone().addScaledVector(camDir, Math.min(maxDist, 40));

    let origin = eye.clone();
    if (this.cameraMode === "third") {
      // ponto no raio da câmera, à frente do personagem (mesmo lado da mira)
      const along = camPos.clone().addScaledVector(camDir, 2.4);
      origin.lerp(along, 0.72);
      origin.y = eye.y * 0.35 + along.y * 0.65;
    }

    const dir = aimPoint.clone().sub(origin);
    if (dir.lengthSq() < 1e-6) {
      return { origin, dir: camDir.clone() };
    }
    // se o alvo ficou atrás da origem (raro), segue a câmera
    if (dir.dot(camDir) < 0.2) {
      return { origin, dir: camDir.clone() };
    }
    dir.normalize();
    return { origin, dir };
  }
}
