# Co-op 2 jogadores (WebRTC + HostGator)

## Como funciona

- A **HostGator** (`api/signal.php`) faz *signaling* (sala, código, offer/answer/ICE) e, se precisar, **relay HTTPS** do jogo.
- Preferência: sincronizar **peer-to-peer** (WebRTC DataChannel + TURN/TURNS).
- Se NAT/firewall bloquear P2P (~8s sem DataChannel), os dois caem no **relay via HTTPS** (mesma API) — passa em redes que só liberam 443.
- O **host** é autoritativo (inimigos, snapshots). O guest espelha.
- GitHub Pages / localhost chamam `https://jhonatanribeiro.com/snow/api/signal.php`.

## Checklist HostGator (obrigatório)

No cPanel, confirme:

1. Existe `public_html/snow/api/signal.php` (versão nova com `action=ping`)
2. Pasta `public_html/snow/data/rooms/` com permissão **755/775** gravável
3. Health check rápido (POST JSON):

```json
{"action":"ping"}
```

Deve responder em &lt;2s algo como `{"ok":true,"ping":true,"roomsWritable":true}`.

4. Create smoke test:

```json
{"action":"create","seed":1}
```

→ `{"ok":true,"code":"…"}`.

Se o arquivo não estiver no último zip, **reenviar** `api/` + garantir `data/rooms/` **sem apagar** `data/leaderboard.json`.

## Limites (v1)

- 2 jogadores por sala
- Se o host cair, a sessão acaba
- Relay HTTPS tem latência maior que P2P (ainda jogável)
- Salas expiram em **30 min** (TTL renovado enquanto há poll)

## Robustez (gh33+ / gh43)

- Rejoin: se o guest marcou entrada mas ainda não há `answer`, um novo `join` substitui o guest (evita 409 preso)
- ICE com ids sequenciais (`sinceId` / `hostIceLastId`) e teto 200
- Cliente: retries no `fetch` de sinalização + mensagens claras no menu
- TURN/TURNS (TLS 443) + failover automático para `action=relay` no PHP (~8s)
- Smoke: `npm run test:coop-relay` (ou `node tests/coop-relay-smoke.mjs`)

## Deploy HostGator

1. `npm run build`
2. Suba `release/hostgator-snow/` (ou `snow.zip`) **sem apagar** `data/leaderboard.json`
3. Garanta que existem:
   - `api/signal.php`
   - `data/rooms/` (com `.htaccess` negando acesso HTTP)
4. Permissões `data/` e `data/rooms/`: 755 ou 775

## Como jogar

1. Host: **Com um amigo** → **Criar sala** → anota/copia o código
2. Guest: cola o código → **Entrar**
3. Quando aparecer “Co-op conectado”, os dois entram no mesmo mundo
4. Vocês devem se ver andando; o baú compartilha depósitos via rede

## Solo

Escolha **Solo** no menu — comportamento antigo (save mid-run, ranking, etc.).
