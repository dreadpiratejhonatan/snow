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

## Host reconnect

Ao criar a sala, o host recebe `hostKey` (guardada em `sessionStorage` neste aparelho).  
Se a aba cair: **Com amigos → Reconectar como host** com o mesmo código — `action=rejoinHost`.

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

1. Existe `public_html/snow/api/signal.php` (com `ping`, `rejoinHost`, `relay`, `maxPlayers`)
2. Pasta `public_html/snow/data/rooms/` com permissão **755/775** gravável
3. Health check (POST JSON): `{"action":"ping"}` → `ok` + `roomsWritable`
4. Create smoke: `{"action":"create","seed":1,"maxPlayers":2}` → `code` + `hostKey`

**Não apague** `data/leaderboard.json` / `data/tickets.json` ao atualizar.

## Limites

- Máx. **3** jogadores por sala (3P só via relay)
- Relay HTTPS tem latência maior que P2P
- Salas expiram em **30 min** (TTL renovado enquanto há poll)
- `hostKey` só existe no browser que criou a sala

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
