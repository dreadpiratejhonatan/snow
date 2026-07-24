# Co-op 2 jogadores (WebRTC + HostGator)

## Como funciona

- A **HostGator** só faz *signaling* (`api/signal.php`): criar sala, código, offer/answer/ICE.
- O jogo sincroniza **peer-to-peer** (WebRTC DataChannel).
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
- TURN gratuito (openrelay) ajuda um pouco; NAT difícil ainda pode falhar — mesma Wi‑Fi ajuda
- Salas expiram em **30 min** (TTL renovado enquanto há poll)

## Robustez (gh33+)

- Rejoin: se o guest marcou entrada mas ainda não há `answer`, um novo `join` substitui o guest (evita 409 preso)
- ICE com ids sequenciais (`sinceId` / `hostIceLastId`) e teto 200
- Cliente: retries no `fetch` de sinalização + mensagens claras no menu

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
