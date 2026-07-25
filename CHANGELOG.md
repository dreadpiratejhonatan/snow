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
- Documentação: `docs/V1-OFICIAL.md`, `docs/API.md`, `docs/COOP.md`, `DEPLOY-SEGURO.md`

### Known limits
- Co-op máximo 2 jogadores; sessão cai se o host sair
- Relay HTTPS tem mais latência que P2P puro

## [Unreleased]

Trabalho na branch `develop` após `v1.0.0` (cache `gh48`).

### Added
- Desafio do dia (seed UTC) + conquistas locais
- Inimigo pterodáctilo (IA flyer)
- Cutscene leve ao spawn do Boto
- Ranking por temporada mensal (`Y-m`) + export JSON
- Tickets admin: bulk status nos cards Abertos
- Co-op até 3 jogadores (relay HTTPS); host reconnect (`hostKey` / `rejoinHost`)
- TURN próprio via `window.NEVE_TURN` / `NEVE_ICE_SERVERS`
- CI GitHub Actions (build + smokes)

### Changed
- Difícil mais punitivo (loot/munição/frio/spawns)
