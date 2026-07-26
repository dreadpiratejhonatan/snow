# Co-op (WebRTC + HostGator)

## Como funciona

- A **HostGator** (`api/signal.php`) faz *signaling* (sala, código, offer/answer/ICE) e, se precisar, **relay HTTPS** do jogo.
- Preferência: sincronizar **peer-to-peer** (WebRTC DataChannel + TURN/TURNS).
- Se NAT/firewall bloquear P2P (~8s sem DataChannel), os peers caem no **relay via HTTPS** (mesma API).
- O **host** é autoritativo (inimigos, snapshots). Guests espelham.
- GitHub Pages / localhost chamam `https://SEU-DOMINIO.com/snow/api/signal.php`.

## Jogadores

| Modo | Sync | Notas |
|------|------|--------|
| 2 jogadores | WebRTC P2P → failover relay | Padrão |
| 3–4 jogadores | **Relay HTTPS** obrigatório | Estrela no servidor (`relayMode`) |

## Reconnect

| Situação | Como |
|----------|------|
| Menu | **Reconectar como host / convidado** (mesmo aparelho + chave) |
| **Durante a partida** | Overlay **Reconectar agora** — não recria o mundo |

Chaves: `hostKey` / `guestKey` em `sessionStorage`; código em `neveLastRoom`.  
Não é possível “virar host” em outro PC — a chave não sai do browser.

## Status no menu

Mensagens típicas: “Conectando P2P…”, “Relay ativo (via servidor)…”, “Host parece offline…”, “Sala sumiu…”.

## TURN próprio (opcional)

Guia completo: [`docs/TURN-VPS.md`](TURN-VPS.md).

Antes de carregar o jogo:

```html
<script>
  window.NEVE_TURN = {
    urls: "turns:seu.servidor:443",
    username: "…",
    credential: "…"
  };
</script>
```

Ver `src/js/net/iceConfig.js`. TURN ajuda 2P P2P; 3–4P seguem no relay.

## Checklist HostGator (obrigatório)

No cPanel, confirme:

1. Existe `public_html/snow/api/signal.php` (com `ping`, `rejoinHost`, `rejoinGuest`, `relay`, `maxPlayers` até **4**)
2. Pasta `public_html/snow/data/rooms/` com permissão **755/775** gravável
3. Health check (POST JSON): `{"action":"ping"}` → `ok` + `roomsWritable`
4. Create smoke: `{"action":"create","seed":1,"maxPlayers":2}` → `code` + `hostKey`

**Não apague** `data/leaderboard.json` / `data/tickets.json` ao atualizar.

## Limites

- Máx. **4** jogadores por sala (3–4 via relay)
- Relay HTTPS tem latência maior que P2P
- Salas expiram em **30 min** (TTL renovado enquanto há poll)
- `hostKey` / `guestKey` só no browser que criou / entrou

## Robustez

- Rejoin guest se join preso sem answer
- Reconnect mid-run (overlay) sem `recreateWorld`
- ICE com ids sequenciais + teto 200
- Cliente: retries + mensagens claras no menu
- Smoke: `npm run test:coop-relay`

## Como jogar

1. Host: **Com amigos** → jogadores (2–4) → **Criar sala** → anota o código  
2. Guest(s): cola o código → **Entrar**  
3. Host/guest caiu mid-run? **Reconectar agora** no overlay  
4. Solo / **Desafio do dia**: seed UTC compartilhado no menu
