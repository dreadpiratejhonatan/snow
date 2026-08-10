/**
 * Cutscenes cinematográficas (API genérica) + anúncios de chef sem pausar o jogo.
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
  // não força pointer lock aqui — Chrome bloqueia logo após exit; o clique no canvas relocka
  if (a.game.state === "playing" && !a.game.input?.mobile && a.game.clickHint) {
    a.game.clickHint.hidden = false;
    a.game.clickHint.textContent = "Clique para continuar mirando";
  }
  a.onEnd?.(!!skipped);
}

/**
 * Chefs: aviso no canto com fade — o jogador continua andando/lutando.
 * (Antes: cutscene que roubava a câmera e pausava o estado.)
 */
function announceBoss(game, flag, title, body) {
  if (game[flag]) return;
  game[flag] = true;
  game.hud?.showAnnounce?.(title, body, 5800);
}

/** Anúncio do Boto (sem pausar a run). */
export function playBotoCutscene(game) {
  announceBoss(
    game,
    "_botoCutDone",
    "O lago desperta",
    "Uma sombra rosada corta a água — o Boto-cor-de-rosa. Último guardião. Prepare-se."
  );
}

export function playPandaCutscene(game) {
  announceBoss(
    game,
    "_pandaCutDone",
    "O Panda desperta",
    "Um rugido baixo entre os pinheiros. Pesado, paciente e letal."
  );
}

export function playSaciCutscene(game) {
  announceBoss(
    game,
    "_saciCutDone",
    "Redemoinho na neve",
    "Uma risada no vento — o Saci-pererê. Um pé, um chapéu, muito caos."
  );
}

export function playTrexCutscene(game) {
  announceBoss(
    game,
    "_trexCutDone",
    "Gatling pré-histórico",
    "O chão treme. Um T-Rex com metralhadora na neblina. Cobertura ou morte."
  );
}

/** Dispara aviso do chef correspondente (uma vez por run). */
export function playChefCutscene(game, enemy) {
  if (!enemy?.type) return;
  if (enemy.tamed) return; // montaria restaurada do save não é ameaça
  if (enemy.type === "boto") playBotoCutscene(game);
  else if (enemy.type === "panda") playPandaCutscene(game, enemy);
  else if (enemy.type === "saci") playSaciCutscene(game, enemy);
  else if (enemy.type === "trex") playTrexCutscene(game, enemy);
}
