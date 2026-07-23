import { signalRequest } from "./signalApi.js";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

/**
 * Sala WebRTC 2P com signaling via PHP (poll).
 * Eventos: onStatus(msg), onOpen(), onMessage(obj), onClose(reason)
 */
export class WebRtcRoom {
  constructor() {
    this.role = null;
    this.code = null;
    this.seed = null;
    this.pc = null;
    this.channel = null;
    this._pollTimer = null;
    this._hostIceSent = 0;
    this._guestIceSent = 0;
    this._hostIceSeen = 0;
    this._guestIceSeen = 0;
    this._closed = false;
    this.onStatus = null;
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
  }

  _status(msg) {
    this.onStatus?.(msg);
  }

  async create(seed) {
    const data = await signalRequest("create", { seed });
    this.role = "host";
    this.code = data.code;
    this.seed = data.seed;
    this._status(`Sala ${this.code} — aguardando amigo…`);
    await this._setupPeer();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async join(code) {
    const data = await signalRequest("join", { code: String(code || "").trim().toUpperCase() });
    this.role = "guest";
    this.code = data.code;
    this.seed = data.seed;
    this._status(`Entrando na sala ${this.code}…`);
    await this._setupPeer();
    this._startPoll();
    return { code: this.code, seed: this.seed };
  }

  async _setupPeer() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this._closed) return;
      const cand = ev.candidate.toJSON();
      if (this.role === "host") {
        this._hostIceSent++;
        signalRequest("publish", {
          code: this.code,
          role: "host",
          ice: [cand],
        }).catch(() => {});
      } else {
        this._guestIceSent++;
        signalRequest("publish", {
          code: this.code,
          role: "guest",
          ice: [cand],
        }).catch(() => {});
      }
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        this._status(`Conexão: ${st}`);
        if (st === "failed" || st === "closed") this.close(st);
      }
    };

    if (this.role === "host") {
      this.channel = this.pc.createDataChannel("coop", { ordered: true });
      this._bindChannel(this.channel);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await signalRequest("publish", {
        code: this.code,
        role: "host",
        offer: this.pc.localDescription,
      });
      this._status(`Sala ${this.code} — offer enviado, aguardando guest…`);
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

  _startPoll() {
    this._stopPoll();
    const tick = async () => {
      if (this._closed) return;
      try {
        await this._pollOnce();
      } catch (e) {
        console.warn("signal poll", e);
      }
      if (!this._closed && !this.isOpen) {
        this._pollTimer = setTimeout(tick, 700);
      }
    };
    tick();
  }

  _stopPoll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }

  async _pollOnce() {
    const data = await signalRequest("poll", {
      code: this.code,
      role: this.role,
      sinceHostIce: this._hostIceSeen,
      sinceGuestIce: this._guestIceSeen,
    });

    if (this.role === "host") {
      if (data.guestJoined) this._status(`Sala ${this.code} — guest entrou, negociando…`);
      if (data.answer && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(data.answer);
        this._status("Answer recebido…");
      }
      for (const c of data.guestIce || []) {
        try {
          await this.pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
      this._guestIceSeen = data.guestIceTotal ?? this._guestIceSeen;
    } else {
      if (data.offer && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(data.offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await signalRequest("publish", {
          code: this.code,
          role: "guest",
          answer: this.pc.localDescription,
        });
        this._status("Answer enviado…");
      }
      for (const c of data.hostIce || []) {
        try {
          await this.pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
      this._hostIceSeen = data.hostIceTotal ?? this._hostIceSeen;
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
