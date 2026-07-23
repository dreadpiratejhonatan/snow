/**
 * Splash / launcher: carrossel de artes (contain), auto-avança, fade para o jogo.
 * Clique/toque/tecla após 1s pula o restante.
 * Slides: splash_screen.png, sc2.jpeg, e sc3/sc4 se existirem no servidor.
 */

const SLIDE_MS = 2800;

function probeSlide(img) {
  return new Promise((resolve) => {
    if (!img) return resolve(false);
    const done = (ok) => resolve(ok);
    if (img.complete && img.naturalWidth > 0) return done(true);
    if (img.complete && img.naturalWidth === 0) return done(false);
    img.addEventListener("load", () => done(true), { once: true });
    img.addEventListener("error", () => done(false), { once: true });
    setTimeout(() => done(img.naturalWidth > 0), 2500);
  });
}

export function runSplash({
  minMs = 4200,
  maxMs = 10000,
  fadeMs = 800,
  skipAfterMs = 1000,
  slideMs = SLIDE_MS,
} = {}) {
  const el = document.getElementById("splash");
  const track = document.getElementById("splash-track");
  const dotsEl = document.getElementById("splash-dots");
  if (!el) return Promise.resolve();

  el.hidden = false;
  el.classList.remove("is-hiding");
  el.setAttribute("aria-hidden", "false");

  const t0 = performance.now();
  let settled = false;
  let index = 0;
  let slides = [];
  let rotateTimer = null;

  const allImgs = [...(track?.querySelectorAll(".splash__slide") || [])];

  // Fallback legado: uma única #splash-img
  const legacy = document.getElementById("splash-img");
  if (!allImgs.length && legacy) {
    allImgs.push(legacy);
  }

  // png → jpeg se splash_screen.png falhar
  for (const img of allImgs) {
    if ((img.getAttribute("data-splash-src") || img.src || "").includes("splash_screen.png")) {
      img.addEventListener(
        "error",
        () => {
          if (!img.src.includes("splash_screen.jpeg")) img.src = "splash_screen.jpeg";
        },
        { once: true }
      );
    }
  }

  const showSlide = (i) => {
    if (!slides.length) return;
    index = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((img, n) => {
      img.classList.toggle("is-active", n === index);
      img.setAttribute("aria-hidden", n === index ? "false" : "true");
    });
    if (dotsEl) {
      [...dotsEl.children].forEach((d, n) => {
        d.classList.toggle("is-active", n === index);
      });
    }
  };

  const buildDots = () => {
    if (!dotsEl) return;
    dotsEl.innerHTML = "";
    if (slides.length < 2) {
      dotsEl.hidden = true;
      return;
    }
    dotsEl.hidden = false;
    slides.forEach((_, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "splash__dot" + (n === 0 ? " is-active" : "");
      b.setAttribute("aria-label", `Arte ${n + 1}`);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        showSlide(n);
        // reinicia ciclo a partir deste slide
        if (rotateTimer) clearInterval(rotateTimer);
        rotateTimer = setInterval(() => showSlide(index + 1), slideMs);
      });
      dotsEl.appendChild(b);
    });
  };

  return new Promise((resolve) => {
    const onSkip = () => {
      if (performance.now() - t0 >= skipAfterMs) finish();
    };

    const detachSkip = () => {
      el.removeEventListener("click", onSkip);
      el.removeEventListener("touchstart", onSkip);
      window.removeEventListener("keydown", onSkip);
      if (rotateTimer) clearInterval(rotateTimer);
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

    Promise.all(allImgs.map((img) => probeSlide(img))).then((oks) => {
      slides = allImgs.filter((img, i) => {
        const ok = oks[i];
        if (!ok) {
          img.hidden = true;
          img.remove();
        } else {
          img.hidden = false;
        }
        return ok;
      });

      if (!slides.length && legacy) {
        slides = [legacy];
      }

      buildDots();
      showSlide(0);

      if (slides.length > 1) {
        rotateTimer = setInterval(() => showSlide(index + 1), slideMs);
      }

      const elapsed = performance.now() - t0;
      // tempo mínimo: ver cada slide ~1 vez (ou minMs)
      const needForCarousel = slides.length > 1 ? slides.length * slideMs * 0.85 : minMs;
      const targetMin = Math.max(minMs, needForCarousel);
      const remainMin = Math.max(0, targetMin - elapsed);
      const remainMax = Math.max(remainMin, maxMs - elapsed);
      const hold = remainMin + (remainMax - remainMin) * 0.35;
      setTimeout(finish, hold);
    });
  });
}
