# Co-op 2 jogadores (WebRTC + HostGator)

## Como funciona

- A **HostGator** só faz *signaling* (`api/signal.php`): criar sala, código, offer/answer/ICE.
- O jogo sincroniza **peer-to-peer** (WebRTC DataChannel).
- O **host** é autoritativo (inimigos, snapshots). O guest espelha.

## Limites (v1)

- 2 jogadores por sala
- Se o host cair, a sessão acaba
- Sem TURN dedicado: redes corporativas/CGNAT podem falhar (STUN público costuma bastar em casa)

## Deploy HostGator

1. `npm run build`
2. Suba `release/hostgator-snow/` (ou `snow.zip`) **sem apagar** `data/leaderboard.json`
3. Garanta que existem:
   - `api/signal.php`
   - `data/rooms/` (com `.htaccess` negando acesso HTTP)
4. Permissões `data/` e `data/rooms/`: 755 ou 775

## GitHub Pages

O cliente em `*.github.io` chama:

`https://jhonatanribeiro.com/snow/api/signal.php`

(mesmo padrão do ranking).

## Como jogar

1. Host: **Criar sala co-op** → anota o código de 6 caracteres
2. Guest: digita o código → **Entrar**
3. Quando aparecer “Co-op conectado”, os dois entram no mesmo mundo
4. Vocês devem se ver andando; o baú compartilha depósitos via rede

## Solo

Escolha **Solo** no menu — comportamento antigo (save mid-run, ranking, etc.).
