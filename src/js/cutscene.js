/**
 * Cutscenes cinematográficas: overlay + caminho de câmera + Esc/clique para pular.
 */
import * as THREE from "three";

let _active = null;

export function isCinematicActive() {
  return !!_active;
}

/**
 * @param {object} game
 * @param {object} opts
 */
export function playCinematic(game, opts) {
  if (!opts || _active) return;
  const el = document.getElementById("cutscene-overlay");
  const title = document.getElementById("cutscene-title");
  const body = document.getElementById("cutscene-body");
  const skipEl = document.getElementById("cutscene-skip");
  if (title) title.textContent = opts.title || "…";
  if (body) body.textContent = opts.body || "";
  if (skipEl) {
    skipEl.textContent = opts.skippable !== false ? "Esc / clique para pular" : "";
  }

  const prevState = game.state === "cutscene" ? "playing" : game.state;
  const cam = game.camera;
  const restore = {
    pos: cam.position.clone(),
    quat: cam.quaternion.clone(),
    fov: cam.fov,
  };

  try {
    document.exitPointerLock?.();
  } catch {
    /* ignore */
  }

  game.state = "cutscene";
  if (el) {
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    el.classList.add("cutscene-overlay--cinema");
  }

  const shots = Array.isArray(opts.shots) ? opts.shots.filter(Boolean) : [];
  _active = {
    game,
    el,
    prevState,
    restore,
    shots,
    shotIndex: 0,
    shotT: 0,
    skippable: opts.skippable !== false,
    holdLeft: shots.length ? 0 : (opts.holdMs ?? 5200) / 1000,
    onEnd: opts.onEnd,
    letterbox: document.getElementById("cutscene-letterbox"),
  };
  if (_active.letterbox) _active.letterbox.hidden = false;

  const skip = (e) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    if (!_active?.skippable) return;
    endCinematic(true);
  };
  _active._onClick = skip;
  _active._onKey = (e) => {
    if (e.code === "Escape" || e.code === "Space" || e.code === "Enter") skip(e);
  };
  el?.addEventListener("click", _active._onClick);
  window.addEventListener("keydown", _active._onKey, true);
}

export function updateCinematic(dt) {
  if (!_active) return false;
  const a = _active;
  const cam = a.game.camera;

  if (a.shots.length) {
    if (a.shotIndex >= a.shots.length) {
      endCinematic(false);
      return true;
    }
    const shot = a.shots[a.shotIndex];
    const dur = Math.max(0.35, shot.duration || 2.5);
    a.shotT += dt;
    const u = Math.min(1, a.shotT / dur);
    const ease = u * u * (3 - 2 * u);
    const from = shot.from || a.restore.pos;
    const lookAt = shot.lookAt || a.game.player?.position || new THREE.Vector3();
    const to = shot.to || from;
    cam.position.lerpVectors(from, to, ease);
    cam.lookAt(lookAt.x, lookAt.y + (shot.lookY ?? 1.2), lookAt.z);
    const targetFov = shot.fov ?? a.restore.fov * 0.92;
    cam.fov = THREE.MathUtils.lerp(a.restore.fov, targetFov, ease * 0.5);
    cam.updateProjectionMatrix();
    if (u >= 1) {
      a.shotIndex += 1;
      a.shotT = 0;
    }
  } else {
    a.holdLeft -= dt;
    if (a.holdLeft <= 0) endCinematic(false);
  }
  return true;
}

export function endCinematic(skipped) {
  if (!_active) return;
  const a = _active;
  _active = null;
  a.el?.removeEventListener("click", a._onClick);
  window.removeEventListener("keydown", a._onKey, true);
  if (a.el) {
    a.el.hidden = true;
    a.el.setAttribute("aria-hidden", "true");
    a.el.classList.remove("cutscene-overlay--cinema");
  }
  if (a.letterbox) a.letterbox.hidden = true;

  const cam = a.game.camera;
  cam.position.copy(a.restore.pos);
  cam.quaternion.copy(a.restore.quat);
  cam.fov = a.restore.fov;
  cam.updateProjectionMatrix();

  if (a.game.state === "cutscene") {
    a.game.state = a.prevState === "cutscene" ? "playing" : a.prevState;
  }
  if (a.game.state === "playing" && !a.game.input?.mobile) {
    a.game.requestPointerLock?.();
  }
  a.onEnd?.(!!skipped);
}

/** Cutscene longa do Boto com órbita no lago. */
export function playBotoCutscene(game) {
  if (game._botoCutDone) return;
  game._botoCutDone = true;

  const lake = game.world?.lakeCenter || game.world?.campfirePos || game.player?.position;
  const origin = lake?.clone?.() || new THREE.Vector3(0, 0, 0);
  const gy = game.world?.groundHeight?.(origin.x, origin.z) ?? 0;
  origin.y = gy;

  const p = game.player?.position || origin;
  const yaw = game.player?.yaw || 0;
  const behind = new THREE.Vector3(
    p.x + Math.sin(yaw) * 5,
    p.y + 2.4,
    p.z + Math.cos(yaw) * 5
  );
  const eye = new THREE.Vector3(p.x, p.y + 1.62, p.z);

  playCinematic(game, {
    id: "boto",
    title: "O lago desperta",
    body:
      "O gelo estala. Uma sombra rosada corta a água sob a superfície — o Boto-cor-de-rosa emerge. Último guardião da expedição. Prepare-se.",
    shots: [
      {
        from: new THREE.Vector3(origin.x + 18, gy + 9, origin.z + 14),
        to: new THREE.Vector3(origin.x + 10, gy + 5.5, origin.z + 8),
        lookAt: origin,
        lookY: 0.6,
        duration: 3.2,
        fov: 58,
      },
      {
        from: new THREE.Vector3(origin.x + 10, gy + 5.5, origin.z + 8),
        to: new THREE.Vector3(origin.x - 6, gy + 3.2, origin.z + 12),
        lookAt: origin,
        lookY: 0.8,
        duration: 3.6,
        fov: 52,
      },
      {
        from: behind,
        to: eye,
        lookAt: origin,
        lookY: 1.0,
        duration: 2.4,
        fov: game.camera?.fov || 75,
      },
    ],
    skippable: true,
  });
}
