/**
 * Cutscenes leves (overlay + mensagem).
 */

export function playBotoCutscene(game) {
  if (game._botoCutDone) return;
  game._botoCutDone = true;
  const el = document.getElementById("cutscene-overlay");
  const title = document.getElementById("cutscene-title");
  const body = document.getElementById("cutscene-body");
  if (!el) {
    game.hud?.showMsg("O lago treme… o Boto-cor-de-rosa desperta.", 5000);
    return;
  }
  if (title) title.textContent = "O lago desperta";
  if (body) {
    body.textContent =
      "Uma sombra rosada corta o gelo. O Boto-cor-de-rosa emerge — o último guardião da expedição.";
  }
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  const prev = game.state;
  game.state = "cutscene";
  const close = () => {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (game.state === "cutscene") game.state = prev === "cutscene" ? "playing" : prev;
    el.removeEventListener("click", close);
  };
  el.addEventListener("click", close);
  setTimeout(close, 5200);
}
