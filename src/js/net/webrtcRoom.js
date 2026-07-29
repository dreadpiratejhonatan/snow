import {
  createRoom,
  joinRoom,
  rejoinHost,
  rejoinGuest,
  publishSignal,
  pollRoom,
  relaySend,
} from "./signalApi.js";
import { buildIceServers } from "./iceConfig.js";

/** Após o guest entrar, se o DataChannel não abrir, usa relay HTTPS. */
const FAILOVER_MS = 8000;
/** Relay: flush/poll mais agressivos (gh93) — menos lag visual no firewall. */
const RELAY_FLUSH_MS = 50;
const RELAY_FLUSH_URGENT_MS = 0;
const POLL_WEBRTC_MS = 600;
const POLL_RELAY_MS = 65;
const POLL_RELAY_HOT_MS = 18;

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
    this._flushDelay = RELAY_FLUSH_MS;
    this._flushing = false;
    this._lastRelayGot = false;
    this.onStatus = null;
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onCode = null;
    this._hostGoneWarned = false;
  }

  _rememberRoom() {
    try {
      if (this.code) sessionStorage.setItem("neveLastRoom", this.code);
      if (this.hostKey) sessionStorage.setItem("neveHostKey:" + this.code, this.hostKey);
      if (this.guestKey) sessionStorage.setItem("neveGuestKey:" + this.code, this.guestKey);
    } catch {
      /* ignore */
    }
  }

  _status(msg) {
    this.onStatus?.(msg);
  }

  async create(seed, opts = {}) {
    const data = await createRoom(seed, { maxPlayers: opts.maxPlayers || 2 });
    this.role = "host";
    this.code = data.code;
    this.seed = data.seed;
    this.hostKey = data.hostKey || null;
    this.maxPlayers = data.maxPlayers || 2;
    this.slot = 0;
    this.peerId = "host";
    this._rememberRoom();
    this.onCode?.(this.code);
    this._status(
      this.maxPlayers >= 3
        ? `Sala ${this.code} (até ${this.maxPlayers}) — sync via servidor. Aguardando amigos…`
        : `Sala criada. Código ${this.code} — peça ao amigo Entrar.`
    );
    await this._setupFlow();
    this._startPoll();
    if (this.maxPlayers >= 3 || data.relayMode) {
      this._enableHttpRelay("max3");
    }
    return { code: this.code, seed: this.seed, hostKey: this.hostKey };
  }

  async join(code) {
    const data = await joinRoom(code);
    this.role = "guest";
    this.code = data.code;
    this.seed = data.seed;
    this.slot = data.slot ?? 0;
    this.peerId = `g${this.slot}`;
    this.maxPlayers = data.maxPlayers || 2;
    this.guestKey = data.guestKey || null;
    this._guestJoined = true;
    this._rememberRoom();
    this._status(
      data.relayMode || this.maxPlayers >= 3
        ? `Entrou na sala ${this.code}. Ligando via servidor…`
        : `Entrou na sala ${this.code}. Conectando P2P…`
    );
    await this._setupFlow();
    this._armFailover();
    this._startPoll();
    if (data.relayMode || this.maxPlayers >= 3) {
      this._enableHttpRelay("max3");
    }
    return { code: this.code, seed: this.seed, slot: this.slot, guestKey: this.guestKey };
  }

  /** Host caiu e voltou com a mesma hostKey. */
  async resumeHost(code, hostKey) {
    const data = await rejoinHost(code, hostKey);
    this.role = "host";
    this.code = data.code;
    this.seed = data.seed;
    this.hostKey = data.hostKey || hostKey;
    this.maxPlayers = data.maxPlayers || 2;
    this.peerId = "host";
    this._guestJoined = true;
    this._closed = false;
    this._httpReady = false;
    this._openFired = false;
    this._rememberRoom();
    this._status(`Host reconectado na sala ${this.code}. Aguardando amigo…`);
    await this._setupFlow();
    this._startPoll();
    if (data.relayMode || this.maxPlayers >= 3) this._enableHttpRelay("host-rejoin");
    else this._armFailover();
    return { code: this.code, seed: this.seed };
  }

  /** Guest caiu e voltou com a mesma guestKey (mesmo aparelho). */
  async resumeGuest(code, guestKey) {
    const data = await rejoinGuest(code, guestKey);
    this.role = "guest";
    this.code = data.code;
    this.seed = data.seed;
    this.slot = data.slot ?? 0;
    this.peerId = `g${this.slot}`;
    this.maxPlayers = data.maxPlayers || 2;
    this.guestKey = data.guestKey || guestKey;
    this._guestJoined = true;
    this._closed = false;
    this._httpReady = false;
    this._openFired = false;
    this._hostGoneWarned = false;
    this._rememberRoom();
    this._status(`Convidado reconectado na sala ${this.code}. Ligando…`);
    await this._setupFlow();
    this._armFailover();
    this._startPoll();
    if (data.relayMode || this.maxPlayers >= 3) this._enableHttpRelay("guest-rejoin");
    return { code: this.code, seed: this.seed, slot: this.slot };
  }

  async _setupFlow() {
    if (this.maxPlayers >= 3) {
      this._enableHttpRelay("max3");
      return;
    }
    if (typeof RTCPeerConnection === "undefined") {
      this._status("WebRTC indisponível neste aparelho — usando relay HTTPS…");
      this._enableHttpRelay("no-webrtc");
      return;
    }
    await this._setupPeer();
  }

  async _setupPeer() {
    this.pc = new RTCPeerConnection(buildIceServers());
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
      if (this._httpReady || this._closed || this._restarting) return;
      const st = this.pc?.connectionState;
      if (st === "failed" || st === "disconnected") {
        this._maybeFailover("conn-" + st);
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
      this._status("Conectado! Canal direto (P2P) — latência baixa.");
      this._stopPoll();
      this._fireOpen();
    };
    ch.onclose = () => {
      if (this._httpReady || this._closed || this._restarting) return;
      // Em handshake ou após P2P cair: tenta relay em vez de matar a sala
      this._maybeFailover("channel-closed");
      if (!this._httpReady && !this._closed) {
        // Host ainda sem guest — só espera; senão encerra
        if (this.role === "host" && !this._guestJoined) return;
        this.close("channel-closed");
      }
    };
    ch.onerror = () => {
      if (this._httpReady || this._closed || this._restarting) return;
      this._maybeFailover("channel-error");
    };
    ch.onmessage = (ev) => {
      if (this._httpReady) return;
      try {
        const obj = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (obj) {
          const from = this.role === "host" ? "g0" : "host";
          this.onMessage?.(obj.from ? obj : { ...obj, from });
        }
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
    this._status(`P2P bloqueado (${reason}) — ativando relay HTTPS…`);
    this._enableHttpRelay(reason);
  }

  _enableHttpRelay(_reason = "failover") {
    if (this._closed || this._httpReady) return;
    this._httpReady = true;
    this.transport = "http";
    this._clearFailover();
    this._status("Relay ativo (via servidor) — funciona atrás de firewall. Pode ter um pouco de lag.");
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
        const msg = e.message || String(e);
        if (/não encontrada|expirou|404/i.test(msg)) {
          this._status("Sala sumiu ou expirou — peça ao host criar de novo.");
          if (this.role === "guest") this.close("room-gone");
        } else {
          this._status(`Sinalização: ${msg}`);
        }
      }
      if (this._closed) {
        this._polling = false;
        return;
      }
      const keep = this._httpReady || this.channel?.readyState !== "open";
      if (keep) {
        let ms = POLL_WEBRTC_MS;
        if (this._httpReady) {
          ms = this._lastRelayGot ? POLL_RELAY_HOT_MS : POLL_RELAY_MS;
        }
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
    this._polling = false;
  }

  async _pollOnce() {
    const data = await pollRoom(
      this.code,
      this._hostIceSeen,
      this._guestIceSeen,
      this._relaySeen,
      this.peerId || this.role || ""
    );

    if (!this._httpReady && data.relayMode) {
      this._enableHttpRelay("peer-relay");
    }

    if (this.role === "guest" && data.hostOnline === false && !this._hostGoneWarned) {
      this._hostGoneWarned = true;
      this._status("Host parece offline — ele pode usar “Reconectar como host”.");
    } else if (this.role === "guest" && data.hostOnline === true) {
      this._hostGoneWarned = false;
    }

    if (this.role === "host" && !this._httpReady && data.needsHostRestart) {
      await this._restartHostPeer();
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

    // Só avança o cursor se entregou (ou não há msgs). Sem onMessage, re-poll
    // devolve as mesmas — evita perder hello/snap antes do CoopSession.
    const relayMsgs = data.relayMsgs || [];
    this._lastRelayGot = relayMsgs.length > 0;
    if (relayMsgs.length) {
      if (this.onMessage) {
        for (const entry of relayMsgs) {
          if (entry?.m) {
            const m = entry.m;
            this.onMessage(m.from ? m : { ...m, from: entry.from });
          }
        }
        if (typeof data.relayLastId === "number" && data.relayLastId > this._relaySeen) {
          this._relaySeen = data.relayLastId;
        }
      }
    } else if (typeof data.relayLastId === "number" && data.relayLastId > this._relaySeen) {
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
    if (this._outQueue.length > 16) {
      // Mantém eventos/hello/chat; descarta poses/snaps antigos
      const keep = this._outQueue.filter(
        (m) => m.t === "event" || m.t === "hello" || m.t === "chat"
      );
      const rest = this._outQueue.filter(
        (m) => m.t !== "event" && m.t !== "hello" && m.t !== "chat"
      );
      this._outQueue = [...rest.slice(-(16 - Math.min(keep.length, 8))), ...keep.slice(-8)];
    }
    const urgent = t === "event" || t === "hello" || t === "chat";
    this._scheduleFlush(urgent ? RELAY_FLUSH_URGENT_MS : RELAY_FLUSH_MS);
  }

  /** Guest reconectou: novo offer (PC limpo). */
  async _restartHostPeer() {
    if (this._closed || this._httpReady || this._restarting) return;
    this._restarting = true;
    this._status("Amigo reconectou — reiniciando P2P…");
    this._guestJoined = true;
    this._remoteReady = false;
    this._pendingIce = [];
    this._hostIceSeen = 0;
    this._guestIceSeen = 0;
    this._openFired = false;
    this.transport = null;
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
    try {
      await this._setupPeer();
      this._armFailover();
      if (!this._polling) this._startPoll();
    } catch (e) {
      console.warn("host restart", e);
      this._maybeFailover("restart-fail");
    } finally {
      this._restarting = false;
    }
  }

  _scheduleFlush(delay = RELAY_FLUSH_MS) {
    if (this._closed || !this._httpReady) return;
    if (this._flushTimer) {
      // Já agendado: só antecipa se o novo delay for menor
      if (delay >= this._flushDelay) return;
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._flushDelay = delay;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushDelay = RELAY_FLUSH_MS;
      this._flushRelay();
    }, delay);
  }

  async _flushRelay() {
    if (this._closed || !this._httpReady || this._flushing) return;
    if (!this._outQueue.length) return;
    const batch = this._outQueue.splice(0, this._outQueue.length);
    this._flushing = true;
    try {
      await relaySend(this.code, this.peerId || this.role, batch);
    } catch (e) {
      console.warn("relay send", e);
      // requeue latest pose/snap only
      for (const m of batch) {
        if (
          m.t === "pose" ||
          m.t === "snap" ||
          m.t === "hello" ||
          m.t === "event" ||
          m.t === "chat"
        ) {
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
