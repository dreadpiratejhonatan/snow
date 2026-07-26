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

/** Shots genéricos orbitando um ponto (chefe). */
function bossOrbitShots(origin, gy, player, game) {
  const p = player?.position || origin;
  const yaw = player?.yaw || 0;
  const behind = new THREE.Vector3(
    p.x + Math.sin(yaw) * 5,
    p.y + 2.4,
    p.z + Math.cos(yaw) * 5
  );
  const eye = new THREE.Vector3(p.x, p.y + 1.62, p.z);
  return [
    {
      from: new THREE.Vector3(origin.x + 16, gy + 8, origin.z + 12),
      to: new THREE.Vector3(origin.x + 9, gy + 5, origin.z + 7),
      lookAt: origin,
      lookY: 0.7,
      duration: 2.6,
      fov: 56,
    },
    {
      from: new THREE.Vector3(origin.x + 9, gy + 5, origin.z + 7),
      to: new THREE.Vector3(origin.x - 5, gy + 3.5, origin.z + 10),
      lookAt: origin,
      lookY: 0.9,
      duration: 2.8,
      fov: 50,
    },
    {
      from: behind,
      to: eye,
      lookAt: origin,
      lookY: 1.0,
      duration: 2.0,
      fov: game.camera?.fov || 75,
    },
  ];
}

function playBossCutscene(game, flag, id, title, body, originHint) {
  if (game[flag]) return;
  game[flag] = true;
  const origin = originHint?.clone?.() || game.player?.position?.clone?.() || new THREE.Vector3();
  const gy = game.world?.groundHeight?.(origin.x, origin.z) ?? 0;
  origin.y = gy;
  playCinematic(game, {
    id,
    title,
    body,
    shots: bossOrbitShots(origin, gy, game.player, game),
    skippable: true,
  });
}

/** Cutscene longa do Boto com órbita no lago. */
export function playBotoCutscene(game) {
  const lake = game.world?.lakeCenter || game.world?.campfirePos || game.player?.position;
  playBossCutscene(
    game,
    "_botoCutDone",
    "boto",
    "O lago desperta",
    "O gelo estala. Uma sombra rosada corta a água sob a superfície — o Boto-cor-de-rosa emerge. Último guardião da expedição. Prepare-se.",
    lake
  );
}

export function playPandaCutscene(game, enemy) {
  playBossCutscene(
    game,
    "_pandaCutDone",
    "panda",
    "O Panda desperta",
    "Um rugido baixo ecoa entre os pinheiros. O Panda sai da neve — pesado, paciente e letal. Não o subestime.",
    enemy?.mesh?.position
  );
}

export function playSaciCutscene(game, enemy) {
  playBossCutscene(
    game,
    "_saciCutDone",
    "saci",
    "Redemoinho na neve",
    "Uma risada fina gira no vento. O Saci-pererê aparece e some — um pé só, um chapéu e muito caos.",
    enemy?.mesh?.position
  );
}

export function playTrexCutscene(game, enemy) {
  playBossCutscene(
    game,
    "_trexCutDone",
    "trex",
    "Gatling pré-histórico",
    "O chão treme. Um T-Rex armado com metralhadora emerge da neblina. Cobertura ou morte.",
    enemy?.mesh?.position
  );
}

/** Dispara cutscene do chef correspondente (uma vez por run). */
export function playChefCutscene(game, enemy) {
  if (!enemy?.type) return;
  if (enemy.tamed) return; // montaria restaurada do save não é ameaça
  if (enemy.type === "boto") playBotoCutscene(game);
  else if (enemy.type === "panda") playPandaCutscene(game, enemy);
  else if (enemy.type === "saci") playSaciCutscene(game, enemy);
  else if (enemy.type === "trex") playTrexCutscene(game, enemy);
}
