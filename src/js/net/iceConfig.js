/**
 * ICE servers — STUN/TURN públicos + TURN próprio opcional.
 *
 * Configure no HTML antes do jogo:
 *   window.NEVE_TURN = { urls: "turns:seu.servidor:443", username: "…", credential: "…" }
 * ou array de servers em window.NEVE_ICE_SERVERS
 */

const OPENRELAY = {
  username: "openrelayproject",
  credential: "openrelayproject",
};

function defaultServers() {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", ...OPENRELAY },
    { urls: "turn:openrelay.metered.ca:80?transport=tcp", ...OPENRELAY },
    { urls: "turn:openrelay.metered.ca:443", ...OPENRELAY },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", ...OPENRELAY },
    { urls: "turns:openrelay.metered.ca:443", ...OPENRELAY },
    { urls: "turns:openrelay.metered.ca:443?transport=tcp", ...OPENRELAY },
  ];
}

export function buildIceServers() {
  try {
    if (Array.isArray(window.NEVE_ICE_SERVERS) && window.NEVE_ICE_SERVERS.length) {
      return { iceServers: window.NEVE_ICE_SERVERS };
    }
    const custom = window.NEVE_TURN;
    const list = defaultServers();
    if (custom && custom.urls) {
      list.unshift({
        urls: custom.urls,
        username: custom.username || "",
        credential: custom.credential || "",
      });
    }
    return { iceServers: list };
  } catch {
    return { iceServers: defaultServers() };
  }
}
