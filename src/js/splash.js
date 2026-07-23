/**
 * Splash / launcher: arte inicial centrada (contain), 3–5s, fade para o jogo.
 * Clique/toque/tecla após 1s pula o restante.
 */
export function runSplash({
  minMs = 3200,
  maxMs = 4800,
  fadeMs = 800,
  skipAfterMs = 1000,
} = {}) {
  const el = document.getElementById("splash");
  const img = document.getElementById("splash-img");
  if (!el) return Promise.resolve();

  el.hidden = false;
  el.classList.remove("is-hiding");
  el.setAttribute("aria-hidden", "false");

  const t0 = performance.now();
  let settled = false;

  const waitImg =
    !img || img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
          setTimeout(resolve, 3500);
        });

  // se .png falhar (JPEG com nome .png em host estrito), tenta .jpeg
  if (img) {
    img.addEventListener(
      "error",
      () => {
        if (!img.src.includes("splash_screen.jpeg")) {
          img.src = "splash_screen.jpeg";
        }
      },
      { once: true }
    );
  }

  return new Promise((resolve) => {
    const onSkip = () => {
      if (performance.now() - t0 >= skipAfterMs) finish();
    };

    const detachSkip = () => {
      el.removeEventListener("click", onSkip);
      el.removeEventListener("touchstart", onSkip);
      window.removeEventListener("keydown", onSkip);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      detachSkip();
      el.classList.add("is-hiding");
      setTimeout(() => {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        resolve();
      }, fadeMs);
    };

    el.addEventListener("click", onSkip);
    el.addEventListener("touchstart", onSkip, { passive: true });
    window.addEventListener("keydown", onSkip);

    waitImg.then(() => {
      const elapsed = performance.now() - t0;
      const remainMin = Math.max(0, minMs - elapsed);
      const remainMax = Math.max(remainMin, maxMs - elapsed);
      // fica ~4s no total (entre min e max)
      const hold = remainMin + (remainMax - remainMin) * 0.4;
      setTimeout(finish, hold);
    });
  });
}
