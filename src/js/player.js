import * as THREE from "three";
import { CONFIG } from "./config.js";
import { getSkin, loadFaceTexture, resolveSkinId } from "./skins.js";
import { buildHeldWeaponMesh } from "./weaponVisuals.js";

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
    this.onGround = false;
    this.cameraMode = "first";
    this.skinId = "natan";
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

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 8), skin);
    neck.position.y = 1.68;

    // Cabeça cubo: rosto na frente (+Z) e nas costas (−Z).
    // Em 3ª pessoa a câmera fica atrás — sem textura no −Z o jogador só via cubo branco.
    const headMats = [skin, skin, skin, skin, face, face];
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), headMats);
    head.position.y = 1.88;
    this.headMesh = head;

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
      neck,
      head,
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

    // viewmodel maior, à frente da câmera
    this.fpWeapon = buildHeldWeaponMesh(id);
    this.fpWeapon.scale.multiplyScalar(1.35);
    this.fpWeapon.rotation.set(-0.35, 0.35, 0.1);
    this.fpWeapon.position.set(0, 0, 0);
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

    // pose de pronto (estilo 3ª pessoa de survival): arma à frente
    const readyR = holding ? (bowLike ? 1.05 : ranged ? 0.85 : 0.55) : 0;
    const readyL = bowLike ? 0.95 : holding && ranged ? 0.45 : 0;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -readyL - swing * (holding ? 0.25 : 0.8) - (bowLike ? punch * 0.4 : 0);
    this.leftArm.rotation.z = bowLike ? 0.35 : 0;
    // braço direito: hold + golpe / recoil
    this.rightArm.rotation.x = -readyR + swing * (holding ? 0.2 : 0.8) - punch * (ranged ? 0.9 : 1.7);
    this.rightArm.rotation.z = punch * (ranged ? 0.15 : 0.5) + (holding ? 0.12 : 0);
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

    const sway = Math.sin(this.walkPhase * 0.5) * 0.18;
    for (let i = 0; i < this.tentacles.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.tentacles[i].rotation.x = -0.25 + sway * dir + punch * 0.2;
      this.tentacles[i].rotation.z = sway * dir * 0.5;
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode === "third" ? "third" : "first";
    this.syncMesh();
    this.syncFpWeaponVisibility();
    this.syncCamera();
  }

  reset(spawn) {
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.moveVel.set(0, 0, 0);
    this.kb.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.syncMesh();
    this.syncCamera();
  }

  applyLook(delta) {
    const sensitivity = 0.0034;
    this.yaw -= delta.x * sensitivity;
    this.pitch -= delta.y * sensitivity;
    // yaw livre 360°; pitch quase no zenite/chão
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
    // evita drift numérico após muitas voltas
    if (this.yaw > Math.PI * 4 || this.yaw < -Math.PI * 4) {
      this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
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

  update(dt, input) {
    const cfg = CONFIG.player;
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

    // 1) movimento horizontal
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.world.clampToBounds(this.position);

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

    // FOV abre um pouco ao correr (sensação de velocidade)
    const targetFov = input.sprint && moving ? 82 : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();

    this.syncMesh();
    this.syncCamera(dt);
  }

  syncMesh() {
    this.mesh.visible = this.cameraMode === "third";
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    // o modelo é construído com a frente para +Z, mas o "para frente" do jogo
    // é -Z quando yaw=0 — soma 180° para o corpo acompanhar a câmera
    this.mesh.rotation.y = this.yaw + Math.PI;
  }

  syncCamera(dt = 0) {
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
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
  }

  syncThirdPersonCamera(dt = 0) {
    const cfg = CONFIG.thirdPerson;
    const pivot = new THREE.Vector3(
      this.position.x,
      this.position.y + cfg.pivotHeight,
      this.position.z
    );
    // ombro direito: boneco à esquerda, mira livre 360°
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    pivot.addScaledVector(right, cfg.shoulderOffset);

    const look = this.lookDirection;
    const back = look.clone().negate();
    const distance = this.clipCameraDistance(pivot, back, cfg.distance);
    const target = pivot.clone().addScaledVector(back, distance);

    // suaviza só a POSIÇÃO; orientação = mesmo Euler da 1ª pessoa (gira 360° sem flip)
    if (dt > 0 && this._camSmooth) {
      this._camSmooth.lerp(target, 1 - Math.exp(-dt * 16));
    } else {
      this._camSmooth = target.clone();
    }
    this.camera.position.copy(this._camSmooth);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
  }

  // impede a câmera de terceira pessoa de atravessar o chão
  clipCameraDistance(pivot, dir, maxDistance) {
    const step = 0.2;
    for (let d = maxDistance; d > CONFIG.thirdPerson.minDistance; d -= step) {
      const px = pivot.x + dir.x * d;
      const py = pivot.y + dir.y * d;
      const pz = pivot.z + dir.z * d;
      if (py > this.world.groundHeight(px, pz) + 0.4) return d;
    }
    return CONFIG.thirdPerson.minDistance;
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
}
