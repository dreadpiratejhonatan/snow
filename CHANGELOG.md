# Changelog

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/).  
Versão oficial documentada em [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md).

## [1.0.0] — 2026-07-25

Primeira versão **oficial** (`release/v1.0`, tag `v1.0.0`).

### Added
- Jogo completo de sobrevivência 3D (Three.js): exploração, loot, combate, frio, dia/noite, estações
- Personagens: Natan, Jhonatan, Jorge Bolado, Caio, Lorenzo, ZÉ
- Dificuldade Fácil / Médio / Difícil
- Chefs: Panda, Saci, T-Rex gatling, Boto-cor-de-rosa (+ troféu do boto na vitória)
- Ranking online HostGator (`api/leaderboard.php`)
- Co-op 2P: signaling + WebRTC + **relay HTTPS** se firewall bloquear P2P (`api/signal.php`)
- Board público de sugestões / bugs estilo Jira (`/tickets/`, `api/tickets.php`)
- Splash com artes sc1–sc4 em ordem aleatória
- Cobertura (árvores/pedras/baú) contra tiros e ataques
- OST procedural estilo aventura 16-bit
- Scroll do mouse para ciclar armas
- Deploy GitHub Pages + pacote HostGator (`release/snow.zip`)
- Documentação: `docs/V1-OFICIAL.md`, `docs/API.md`, `docs/COOP.md`, `docs/DEPLOY-SEGURO.md`

### Known limits
- Co-op máximo 2 jogadores; sessão cai se o host sair
- Relay HTTPS tem mais latência que P2P puro

## [Unreleased]

Trabalho na branch `develop` após `v1.0.0` (cache **`gh67`**).  
Resumo narrativo: [`docs/DEVELOP-ATE-GH63.md`](docs/DEVELOP-ATE-GH63.md).

### Changed
- Organização do repositório: artes do splash em `assets/splash/`; guias `DEPLOY-SEGURO`, `GITHUB-PAGES` e `RELEASE-NOTES` em `docs/`

### Added
- Personagem jogável **HEROBRINE** (Jonathan Herobrine) — rosto em `faces/herobrine.png`
- Desafio do dia (seed UTC) + conquistas locais
- Inimigo pterodáctilo (IA flyer) + **raposa-da-neve**
- Cutscene cinematográfica do Boto (caminho de câmera + Esc)
- Ranking por temporada mensal (`Y-m`) + export JSON
- Tickets admin: bulk status nos cards Abertos
- Co-op até **4** jogadores (relay HTTPS) + avatares multi-remoto
- Host reconnect (`hostKey`) + guest reconnect (`guestKey` / `rejoinGuest`)
- Rejoin mid-run (overlay **Reconectar agora**, sem menu)
- Status claros no menu (P2P / relay / host offline / sala sumiu)
- Chat in-game estilo CS (`Y` / `Enter`) no co-op
- TURN próprio via `window.NEVE_TURN` / `NEVE_ICE_SERVERS` + `docs/TURN-VPS.md`
- CI GitHub Actions (build + smokes)
- Sussurros sintéticos bem esporádicos na ambiência (mais à noite)
- Hotbar de armas estilo Minecraft (1 linha); inventário abre ao jogar
- Mira ADS (segurar botão direito): zoom FOV + vignette + ponto
- Winter whiteout (neve/névoa mais fortes no inverno)
- OST ambient em arquivo (`music/*.wav` + `manifest.json`)
- Sons de armas (tiro/melee/dry-fire/recarga) + puxar corda
- Carga de arco/besta (segurar LMB → barra na mira → soltar atira mais forte)
- Tutorial pulável (Esc / P / botão)
- Aviso de munição crítica na HUD
- Guia deploy HostGator atualizado + `scripts/prepare-hostgator-deploy.ps1`

### Changed
- Difícil mais punitivo (loot/munição/frio/spawns)
- Cast só amigos (Rita/Bruno removidos)
- Munição mais escassa no mapa e nos drops
- Hitscan/projéteis alinhados à crosshair
- Trilha procedural ambient (baixa) + prioridade a arquivos em `music/`

### Fixed
- Placa branca flutuante no telhado da cabana (cone de neve)
- Inventário de armas “sumido” (agora visível por padrão na partida)
