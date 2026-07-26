# Neve Selvagem — o que foi feito após a v1.0 (até gh63)

Branch: **`develop`**  
Cache do cliente: **`?v=gh63`**  
Corte oficial anterior: **`v1.0.0`** / `release/v1.0` (ver [`V1-OFICIAL.md`](V1-OFICIAL.md))

Este documento resume **tudo entregue no ciclo pós-v1** até o pacote HostGator com armas sonoras + carga de arco/besta.

---

## Como ler o “gh”

`gh61`, `gh62`, `gh63`… são só **números de cache** no HTML (`bundle.js?v=gh63`).  
Cada bump força o navegador a baixar JS/CSS novos após o deploy. Não é semver oficial.

---

## Pacote e deploy

| Item | Onde |
|------|------|
| Zip HostGator | `release/snow.zip` |
| Pasta pronta | `release/hostgator-snow/` |
| Build | `npm run build` ou `scripts/prepare-hostgator-deploy.ps1` |
| Guia seguro | [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md) |
| Co-op | [`COOP.md`](COOP.md) |
| TURN (VPS) | [`TURN-VPS.md`](TURN-VPS.md) |
| Backlog Fase 2 | [`FASE2-BACKLOG.md`](FASE2-BACKLOG.md) |
| Changelog vivo | [`CHANGELOG.md`](../CHANGELOG.md) → seção `[Unreleased]` |

**Importante no deploy:** nunca apagar `data/leaderboard.json` / `data/tickets.json` no servidor.

---

## 1. Co-op e rede

- Relay HTTPS quando P2P falha (`api/signal.php`)
- Co-op até **4 jogadores** (3–4 via relay; avatares multi-remoto)
- Host reconnect (`hostKey`) + guest reconnect (`guestKey` / `rejoinGuest`)
- **Rejoin mid-run:** overlay “Reconectar agora” sem voltar ao menu / sem recriar o mundo
- Status claros: P2P, relay, host offline, sala sumiu
- Chat in-game estilo CS (`Y` / `Enter`)
- Hook TURN: `window.NEVE_TURN` / `NEVE_ICE_SERVERS` + guia coturn
- CI: build + smokes (GitHub Actions)

---

## 2. Meta / progresso

- Desafio do dia (seed UTC)
- Conquistas locais
- Ranking por temporada mensal (`Y-m`) + export JSON
- Tickets: board estilo Jira + admin bulk status
- Tutorial pulável (Esc / P / botão)
- Auto-save mid-run (solo); co-op limpa save solo ao entrar

---

## 3. Combate e armas

- Hitscan / projéteis alinhados à **crosshair** (mira da câmera)
- Scroll / 1–9 / 0 para ciclar armas
- **Hotbar estilo Minecraft** (1 linha, ícones pequenos); inventário abre ao jogar (**B** esconde)
- **ADS:** segurar botão direito → zoom FOV, sensibilidade menor, vignette, ponto na mira; em 3ª pessoa aproxima a câmera
- Munição mais escassa; HUD de munição crítica (≤3) + tint no slot
- **Sons de armas:** tiro por tipo, melee, granada, dry-fire, recarga (**R**)
- **Arco / besta — carga:** segurar esquerdo carrega (barra sob a mira); soltar dispara com dano / velocidade / alcance proporcionais
- Cobertura: obstáculos bloqueiam tiros e ataques inimigos

---

## 4. Mundo, fauna e atmosfera

- Estações (primavera → verão → outono → inverno)
- **Winter whiteout:** neve/névoa mais fortes no inverno
- Pterodáctilo (IA flyer)
- **Raposa-da-neve** (IA de lobo, mesh próprio)
- Cast só amigos (Rita/Bruno removidos)
- Cutscene **cinematográfica** do Boto (caminho de câmera + Esc/clique)
- Sussurros sintéticos raros + toast atmosférico
- Fix telhado da cabana (placa branca flutuante = cone de neve removido)

---

## 5. Áudio / trilha

- Trilha procedural **ambient** (volume baixo, poucas notas)
- OST em arquivo: `music/*.wav` + `music/manifest.json` (gerador: `scripts/gen-ambient-music.mjs`)
- Arquivos têm prioridade sobre procedural quando o manifesto é válido
- BGM “16-bit” foi revertida por poluição sonora

---

## 6. UX / HUD / polish

- Hotbar + detalhe do item equipado
- Controles atualizados (mira, armas, chat, carga de arco)
- Ajuda (H) com FAQ expandido
- Splash com artes em ordem aleatória

---

## Controles relevantes (desktop)

| Ação | Tecla / mouse |
|------|----------------|
| Mover / correr / pular | WASD · Shift · Espaço |
| Olhar (sem mouse) | IJKL |
| Atacar | Clique esquerdo (arco/besta: **segurar** carrega, **soltar** atira) |
| Mirar (ADS) | Segurar botão direito |
| Armas | Scroll · 1–9/0 · **B** mostra/esconde hotbar |
| Recarregar | R |
| Armadilhas | G tipo · F colocar · C craft cerca |
| Chat | Y ou Enter |
| 1ª / 3ª pessoa | V / Tab |
| Órbita (3ª) | Alt + mouse/setas |
| Ajuda / ranking / pause | H · T · Esc |

---

## Commits recentes deste ciclo (referência)

Ordem aproximada (mais novo primeiro na `develop`):

1. Weapon SFX + carga arco/besta + docs deploy (`gh63`)
2. Feature pack: 4P, ADS, raposa, cinema, music files, TURN docs
3. Rejoin mid-run / inventário / OST ambient (commits anteriores do pack)
4. Fixes: telhado cabana, munição crítica, sussurros, aim crosshair, tutorial skip, chat CS, guest rejoin, cast amigos, daily/achievements/3P…

Histórico completo: `git log develop`.

---

## Ainda aberto (não feito)

- Mesh P2P real entre 4 peers (hoje estrela no relay)
- Credenciais TURN coturn **em produção** (só guia + hook no cliente)
- Mais biomas além das estações
- Cutscenes longas para outros chefs (API `playCinematic` já existe)
- Deploy HostGator: passo humano no cPanel (zip local já gerado)

---

## Links úteis

| Ambiente | URL típica |
|----------|------------|
| HostGator | https://jhonatanribeiro.com/snow/ |
| Tickets | https://jhonatanribeiro.com/snow/tickets/ |
| GitHub Pages | build estático do `dist/` (API continua na HostGator) |
