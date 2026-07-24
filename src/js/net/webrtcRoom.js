import { createRoom, joinRoom, publishSignal, pollRoom } from "./signalApi.js";

/** STUN + TURN gratuito (openrelay) — melhora NAT sem custo extra de hosting. */
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
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

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
 * Sala WebRTC 2P com signaling via PHP (poll).
 */
export class WebRtcRoom {
  constructor() {
    this.role = null;
    this.code = null;
    this.seed = null;
    this.pc = null;
    this.channel = null;
    this._pollTimer = null;
    this._hostIceSeen = 0;
    this._guestIceSeen = 0;
    this._closed = false;
    this._remoteReady = false;
    this._pendingIce = [];
    this._guestJoined = false;
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
    await this._setupPeer();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async join(code) {
    const data = await joinRoom(code);
    this.role = "guest";
    this.code = data.code;
    this.seed = data.seed;
    this._status(`Entrou na sala ${this.code}. Conectando…`);
    await this._setupPeer();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async _setupPeer() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this._closed) return;
      const cand = ev.candidate.toJSON();
      publishSignal(this.code, this.role, { ice: [cand] }).catch((e) =>
        console.warn("ice publish", e)
      );
    };
    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState;
      if (st && st !== "new" && st !== "checking") {
        this._status(`Rede P2P: ${st}`);
      }
      if (st === "failed") {
        this._status(
          "Falha P2P (NAT/firewall). Mesma rede Wi‑Fi ajuda; evite um no Wi‑Fi e outro só em dados móveis."
        );
      }
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === "failed" || st === "closed") this.close(st);
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
      this._status("Co-op conectado!");
      this._stopPoll();
      this.onOpen?.();
    };
    ch.onclose = () => this.close("channel-closed");
    ch.onerror = () => this.close("channel-error");
    ch.onmessage = (ev) => {
      try {
        const obj = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (obj) this.onMessage?.(obj);
      } catch {
        /* ignore */
      }
    };
  }

  async _flushPendingIce() {
    if (!this._remoteReady || !this.pc) return;
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
    const tick = async () => {
      if (this._closed) return;
      try {
        await this._pollOnce();
      } catch (e) {
        console.warn("signal poll", e);
        this._status(`Sinalização: ${e.message || e}`);
      }
      if (!this._closed && !this.isOpen) {
        this._pollTimer = setTimeout(tick, 600);
      }
    };
    tick();
  }

  _stopPoll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }

  async _pollOnce() {
    const data = await pollRoom(this.code, this._hostIceSeen, this._guestIceSeen);

    if (this.role === "host") {
      if (data.guestJoined && !this._guestJoined) {
        this._guestJoined = true;
        this._status(`Amigo entrou na sala ${this.code}. Negociando conexão…`);
      }
      if (data.answer && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(data.answer);
        this._remoteReady = true;
        await this._flushPendingIce();
        this._status("Handshake OK — abrindo canal…");
      }
      await this._addIce(data.guestIce);
      this._guestIceSeen = iceCursor(data, "guest", this._guestIceSeen);
    } else {
      if (data.offer && !this.pc.currentRemoteDescription) {
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
  }

  get isOpen() {
    return this.channel?.readyState === "open";
  }

  send(obj) {
    if (!this.isOpen) return false;
    try {
      this.channel.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  close(reason = "closed") {
    if (this._closed) return;
    this._closed = true;
    this._stopPoll();
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
