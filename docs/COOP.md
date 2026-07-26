# Co-op (WebRTC + HostGator)

## Como funciona

- A **HostGator** (`api/signal.php`) faz *signaling* (sala, código, offer/answer/ICE) e, se precisar, **relay HTTPS** do jogo.
- Preferência: sincronizar **peer-to-peer** (WebRTC DataChannel + TURN/TURNS).
- Se NAT/firewall bloquear P2P (~8s sem DataChannel), os peers caem no **relay via HTTPS** (mesma API).
- O **host** é autoritativo (inimigos, snapshots). Guests espelham.
- GitHub Pages / localhost chamam `https://jhonatanribeiro.com/snow/api/signal.php`.

## Jogadores

| Modo | Sync | Notas |
|------|------|--------|
| 2 jogadores | WebRTC P2P → failover relay | Padrão |
| 3 jogadores | **Relay HTTPS** obrigatório | Estrela no servidor (`relayMode`) |

## Reconnect (mesmo aparelho)

| Papel | Chave | Botão no menu |
|-------|--------|----------------|
| Host | `hostKey` em `sessionStorage` | **Reconectar como host** → `rejoinHost` |
| Guest | `guestKey` em `sessionStorage` | **Reconectar como convidado** → `rejoinGuest` |

O código da última sala fica em `neveLastRoom` (preenche o campo).  
Não é possível “virar host” em outro PC — a chave não sai do browser.

## Status no menu

Mensagens típicas: “Conectando P2P…”, “Relay ativo (via servidor)…”, “Host parece offline…”, “Sala sumiu…”.

## TURN próprio (opcional)

Antes de carregar o jogo:

```html
<script>
  window.NEVE_TURN = {
    urls: "turns:seu.servidor:443",
    username: "…",
    credential: "…"
  };
  // ou: window.NEVE_ICE_SERVERS = [ { urls: "stun:…" }, { urls: "turn:…", … } ];
</script>
```

Ver `src/js/net/iceConfig.js`.

## Checklist HostGator (obrigatório)

No cPanel, confirme:

1. Existe `public_html/snow/api/signal.php` (com `ping`, `rejoinHost`, `rejoinGuest`, `relay`, `maxPlayers`)
2. Pasta `public_html/snow/data/rooms/` com permissão **755/775** gravável
3. Health check (POST JSON): `{"action":"ping"}` → `ok` + `roomsWritable`
4. Create smoke: `{"action":"create","seed":1,"maxPlayers":2}` → `code` + `hostKey`

**Não apague** `data/leaderboard.json` / `data/tickets.json` ao atualizar.

## Limites

- Máx. **3** jogadores por sala (3P só via relay)
- Relay HTTPS tem latência maior que P2P
- Salas expiram em **30 min** (TTL renovado enquanto há poll)
- `hostKey` / `guestKey` só no browser que criou / entrou

## Robustez

- Rejoin guest se join preso sem answer
- ICE com ids sequenciais + teto 200
- Cliente: retries + mensagens claras no menu
- Smoke: `npm run test:coop-relay`

## Como jogar

1. Host: **Com amigos** → jogadores (2 ou 3) → **Criar sala** → anota o código  
2. Guest(s): cola o código → **Entrar**  
3. Host caiu? Mesmo PC: **Reconectar como host**  
4. Solo / **Desafio do dia**: seed UTC compartilhado no menu

## Deploy HostGator

1. `npm run build`
2. Suba `release/hostgator-snow/` (ou `snow.zip`) **sem apagar** `data/*.json`
3. Garanta `api/signal.php` + `data/rooms/` (+ `.htaccess` negando HTTP na pasta)
