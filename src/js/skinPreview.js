import * as THREE from "three";
import { getSkin, loadFaceTexture } from "./skins.js";

/**
 * Preview 3D do personagem no picker — arraste para girar e ver o rosto.
 */
export class SkinPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    this.camera.position.set(0, 1.35, 3.2);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x334455, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 4, 3);
    this.scene.add(hemi, key);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.yaw = 0.35;
    this.pitch = 0.08;
    this._drag = false;
    this._lastX = 0;
    this._lastY = 0;
    this._raf = 0;
    this._alive = true;
    this.mats = null;

    this._onDown = (e) => {
      this._drag = true;
      const p = e.touches ? e.touches[0] : e;
      this._lastX = p.clientX;
      this._lastY = p.clientY;
      e.preventDefault();
    };
    this._onMove = (e) => {
      if (!this._drag) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - this._lastX;
      const dy = p.clientY - this._lastY;
      this._lastX = p.clientX;
      this._lastY = p.clientY;
      this.yaw += dx * 0.01;
      this.pitch = Math.max(-0.4, Math.min(0.55, this.pitch + dy * 0.008));
      e.preventDefault();
    };
    this._onUp = () => {
      this._drag = false;
    };

    canvas.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    canvas.addEventListener("touchstart", this._onDown, { passive: false });
    window.addEventListener("touchmove", this._onMove, { passive: false });
    window.addEventListener("touchend", this._onUp);

    this.buildDummy();
    this.resize();
    this.loop();
  }

  buildDummy() {
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const suit = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.55 });
    const face = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      side: THREE.FrontSide,
    });
    this.mats = { suit, shirt, skin, face };

    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.72, 12), suit);
    torso.position.y = 1.28;
    const shirtStrip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.55, 8), shirt);
    shirtStrip.position.set(0, 1.32, 0.13);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), skin);
    neck.position.y = 1.68;
    // Cabeça só pele; rosto no +Z (câmera do preview em +Z vê a frente)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.9;
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.3), face);
    facePlane.position.set(0, 1.9, 0.162);
    body.add(torso, shirtStrip, neck, head, facePlane);
    this.root.add(body);
  }

  async setSkin(skinId) {
    const def = getSkin(skinId);
    if (!def || !this.mats) return;
    this.mats.suit.color.setHex(def.suit);
    this.mats.shirt.color.setHex(def.shirt);
    this.mats.skin.color.setHex(def.skin);
    const tex = await loadFaceTexture(def.face);
    if (!tex) return;
    this.mats.face.map = tex;
    this.mats.face.color.setHex(0xffffff);
    this.mats.face.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth || 280;
    const h = this.canvas.clientHeight || 280;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop = () => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this.loop);
    if (!this._drag) this.yaw += 0.004;
    const r = 3.15;
    const cy = 1.35 + Math.sin(this.pitch) * 0.35;
    this.camera.position.set(
      Math.sin(this.yaw) * r * Math.cos(this.pitch),
      cy,
      Math.cos(this.yaw) * r * Math.cos(this.pitch)
    );
    this.camera.lookAt(0, 1.45, 0);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this._alive = false;
    cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener("pointerdown", this._onDown);
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
    this.canvas.removeEventListener("touchstart", this._onDown);
    window.removeEventListener("touchmove", this._onMove);
    window.removeEventListener("touchend", this._onUp);
    this.renderer.dispose();
  }
}
