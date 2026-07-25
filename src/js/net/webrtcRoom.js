import { createRoom, joinRoom, publishSignal, pollRoom, relaySend } from "./signalApi.js";

/**
 * STUN + TURN (UDP/TCP) + TURNS (TLS:443) — melhor chance atrás de firewall.
 * Se ainda falhar, cai no relay HTTPS via signal.php.
 */
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

/** Após o guest entrar, se o DataChannel não abrir, usa relay HTTPS. */
const FAILOVER_MS = 10000;
const RELAY_FLUSH_MS = 140;
const POLL_WEBRTC_MS = 600;
const POLL_RELAY_MS = 180;

function sdpPayload(desc) {
  if (!desc) return null;
  return { type: desc.type, sdp: desc.sdp };
}

function iceCursor(data, side, prev) {
  if (side === "host") {
    return data.hostIceLastId ?? data.hostIceTotal ?? prev;
  }
  return data.guestIceLastId ?? data.guestIceTotal ?? prev;
}

/**
 * Sala 2P: tenta WebRTC DataChannel; se NAT/firewall bloquear, relay HTTPS.
 */
export class WebRtcRoom {
  constructor() {
    this.role = null;
    this.code = null;
    this.seed = null;
    /** @type {'webrtc'|'http'|null} */
    this.transport = null;
    this.pc = null;
    this.channel = null;
    this._pollTimer = null;
    this._hostIceSeen = 0;
    this._guestIceSeen = 0;
    this._relaySeen = 0;
    this._closed = false;
    this._remoteReady = false;
    this._pendingIce = [];
    this._guestJoined = false;
    this._httpReady = false;
    this._openFired = false;
    this._failoverTimer = null;
    this._polling = false;
    this._outQueue = [];
    this._flushTimer = null;
    this._flushing = false;
    this.onStatus = null;
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onCode = null;
  }

  _status(msg) {
    this.onStatus?.(msg);
  }

  async create(seed) {
    const data = await createRoom(seed);
    this.role = "host";
    this.code = data.code;
    this.seed = data.seed;
    this.onCode?.(this.code);
    this._status(`Sala criada. Código ${this.code} — peça ao amigo para Entrar.`);
    await this._setupFlow();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async join(code) {
    const data = await joinRoom(code);
    this.role = "guest";
    this.code = data.code;
    this.seed = data.seed;
    this._guestJoined = true;
    this._status(`Entrou na sala ${this.code}. Conectando…`);
    await this._setupFlow();
    this._armFailover();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async _setupFlow() {
    if (typeof RTCPeerConnection === "undefined") {
      this._status("WebRTC indisponível neste aparelho — usando relay HTTPS…");
      this._enableHttpRelay("no-webrtc");
      return;
    }
    await this._setupPeer();
  }

  async _setupPeer() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this._closed || this._httpReady) return;
      const cand = ev.candidate.toJSON();
      publishSignal(this.code, this.role, { ice: [cand] }).catch((e) =>
        console.warn("ice publish", e)
      );
    };
    this.pc.oniceconnectionstatechange = () => {
      if (this._httpReady || this._closed) return;
      const st = this.pc?.iceConnectionState;
      if (st && st !== "new" && st !== "checking") {
        this._status(`Rede P2P: ${st}`);
      }
      if (st === "failed") {
        this._maybeFailover("ice-failed");
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this._httpReady || this._closed) return;
      const st = this.pc?.connectionState;
      if (st === "failed") {
        this._maybeFailover("conn-failed");
      } else if (st === "closed" && !this._httpReady && !this.isOpen) {
        this.close("closed");
      }
    };

    if (this.role === "host") {
      this.channel = this.pc.createDataChannel("coop", { ordered: true });
      this._bindChannel(this.channel);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await publishSignal(this.code, "host", {
        offer: sdpPayload(this.pc.localDescription),
      });
      this._status(`Código ${this.code} — aguardando amigo clicar em Entrar…`);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.channel = ev.channel;
        this._bindChannel(this.channel);
      };
    }
  }

  _bindChannel(ch) {
    ch.binaryType = "arraybuffer";
    ch.onopen = () => {
      if (this._closed || this._httpReady) return;
      this.transport = "webrtc";
      this._clearFailover();
      this._status("Co-op conectado (P2P)!");
      this._stopPoll();
      this._fireOpen();
    };
    ch.onclose = () => {
      if (this._httpReady || this._closed) return;
      if (this._openFired && this.transport === "webrtc") {
        this._maybeFailover("channel-closed");
        return;
      }
      this.close("channel-closed");
    };
    ch.onerror = () => {
      if (this._httpReady || this._closed) return;
      this._maybeFailover("channel-error");
    };
    ch.onmessage = (ev) => {
      if (this._httpReady) return;
      try {
        const obj = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (obj) this.onMessage?.(obj);
      } catch {
        /* ignore */
      }
    };
  }

  _fireOpen() {
    if (this._openFired || this._closed) return;
    this._openFired = true;
    this.onOpen?.();
  }

  _armFailover() {
    if (this._failoverTimer || this._httpReady || this.isOpen) return;
    this._failoverTimer = setTimeout(() => {
      this._failoverTimer = null;
      this._maybeFailover("timeout");
    }, FAILOVER_MS);
  }

  _clearFailover() {
    if (this._failoverTimer) {
      clearTimeout(this._failoverTimer);
      this._failoverTimer = null;
    }
  }

  _maybeFailover(reason) {
    if (this._closed || this._httpReady || this.channel?.readyState === "open") return;
    if (this.role === "host" && !this._guestJoined) return;
    this._status(`P2P bloqueado (${reason}) — mudando para relay HTTPS…`);
    this._enableHttpRelay(reason);
  }

  _enableHttpRelay(_reason = "failover") {
    if (this._closed || this._httpReady) return;
    this._httpReady = true;
    this.transport = "http";
    this._clearFailover();
    this._status("Co-op via servidor (HTTPS) — funciona atrás de firewall.");
    try {
      this.channel?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.channel = null;
    this.pc = null;
    publishSignal(this.code, this.role, { relayMode: true }).catch(() => {});
    this._scheduleFlush();
    this._fireOpen();
    // Se o poll já está no ar (handshake), só muda o intervalo no próximo tick.
    // Se o P2P tinha parado o poll, reinicia.
    if (!this._polling) this._startPoll();
  }

  async _flushPendingIce() {
    if (!this._remoteReady || !this.pc || this._httpReady) return;
    const batch = this._pendingIce.splice(0, this._pendingIce.length);
    for (const c of batch) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
  }

  async _addIce(list) {
    if (this._httpReady) return;
    for (const c of list || []) {
      if (!c) continue;
      if (!this._remoteReady) this._pendingIce.push(c);
      else {
        try {
          await this.pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
    }
  }

  _startPoll() {
    this._stopPoll();
    this._polling = true;
    const tick = async () => {
      if (this._closed) {
        this._polling = false;
        return;
      }
      try {
        await this._pollOnce();
      } catch (e) {
        console.warn("signal poll", e);
        this._status(`Sinalização: ${e.message || e}`);
      }
      if (this._closed) {
        this._polling = false;
        return;
      }
      const keep = this._httpReady || this.channel?.readyState !== "open";
      if (keep) {
        const ms = this._httpReady ? POLL_RELAY_MS : POLL_WEBRTC_MS;
        this._pollTimer = setTimeout(tick, ms);
      } else {
        this._polling = false;
      }
    };
    tick();
  }

  _stopPoll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }

  async _pollOnce() {
    const data = await pollRoom(
      this.code,
      this._hostIceSeen,
      this._guestIceSeen,
      this._relaySeen,
      this.role || ""
    );

    if (!this._httpReady && data.relayMode) {
      this._enableHttpRelay("peer-relay");
    }

    if (this.role === "host" && !this._httpReady) {
      if (data.guestJoined && !this._guestJoined) {
        this._guestJoined = true;
        this._status(`Amigo entrou na sala ${this.code}. Negociando conexão…`);
        this._armFailover();
      }
      if (data.answer && this.pc && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(data.answer);
        this._remoteReady = true;
        await this._flushPendingIce();
        this._status("Handshake OK — abrindo canal…");
      }
      await this._addIce(data.guestIce);
      this._guestIceSeen = iceCursor(data, "guest", this._guestIceSeen);
    } else if (this.role === "guest" && !this._httpReady) {
      if (data.offer && this.pc && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(data.offer);
        this._remoteReady = true;
        await this._flushPendingIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await publishSignal(this.code, "guest", {
          answer: sdpPayload(this.pc.localDescription),
        });
        this._status("Resposta enviada — abrindo canal…");
      }
      await this._addIce(data.hostIce);
      this._hostIceSeen = iceCursor(data, "host", this._hostIceSeen);
    }

    const relayMsgs = data.relayMsgs || [];
    for (const entry of relayMsgs) {
      if (entry?.m) this.onMessage?.(entry.m);
    }
    if (typeof data.relayLastId === "number" && data.relayLastId > this._relaySeen) {
      this._relaySeen = data.relayLastId;
    }
  }

  get isOpen() {
    return this._httpReady || this.channel?.readyState === "open";
  }

  send(obj) {
    if (!obj) return false;
    if (this._httpReady) {
      this._enqueueRelay(obj);
      return true;
    }
    if (this.channel?.readyState !== "open") return false;
    try {
      this.channel.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  _enqueueRelay(obj) {
    const t = obj.t;
    if (t === "pose" || t === "snap") {
      this._outQueue = this._outQueue.filter((m) => m.t !== t);
    }
    this._outQueue.push(obj);
    if (this._outQueue.length > 12) {
      this._outQueue = this._outQueue.slice(-12);
    }
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._flushTimer || this._closed || !this._httpReady) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushRelay();
    }, RELAY_FLUSH_MS);
  }

  async _flushRelay() {
    if (this._closed || !this._httpReady || this._flushing) return;
    if (!this._outQueue.length) return;
    const batch = this._outQueue.splice(0, this._outQueue.length);
    this._flushing = true;
    try {
      await relaySend(this.code, this.role, batch);
    } catch (e) {
      console.warn("relay send", e);
      // requeue latest pose/snap only
      for (const m of batch) {
        if (m.t === "pose" || m.t === "snap" || m.t === "hello" || m.t === "event") {
          this._enqueueRelay(m);
        }
      }
    } finally {
      this._flushing = false;
      if (this._outQueue.length) this._scheduleFlush();
    }
  }

  close(reason = "closed") {
    if (this._closed) return;
    this._closed = true;
    this._clearFailover();
    this._stopPoll();
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._outQueue = [];
    try {
      this.channel?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.onClose?.(reason);
  }
}
