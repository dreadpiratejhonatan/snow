# Changelog

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/).  
Versão oficial documentada em [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md).

## [1.0.0] — 2026-07-25

Primeira versão **oficial** (`release/v1.0`, tag `v1.0.0`).

### Added
- Jogo completo de sobrevivência 3D (Three.js): exploração, loot, combate, frio, dia/noite, estações
- Personagens: Natan, Jorge Bolado, Caio, Lorenzo, ZÉ
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

Trabalho na branch `develop` após `v1.0.0` (cache **`gh91`**).  
Resumo narrativo: [`docs/DEVELOP-ATE-GH63.md`](docs/DEVELOP-ATE-GH63.md) · [`DEVELOP-GH64-ATE-GH73.md`](docs/DEVELOP-GH64-ATE-GH73.md).

### Fixed
- **Hotbar mobile (gh91)**: barra de armas de novo visível no celular (acima do stick; sem “Punhos” / ✕)
- **HUD mobile (gh90)**: tutorial não cobre ❤/🔥; sem texto “Punhos” em cima dos botões; status sob o minimapa

### Added
- **Solo sazonal (gh89)**: chão e vegetação (grama/folhas) mudam de cor com as estações — gradual, Classic e Random; desktop também (material + vertex tint)
- **Tutorial/ajuda: montarias (gh86)**: passo 6/7 ensina a domar; FAQ e controles mencionam mula, cavalo, pônei, dromedário e panda

### Changed
- **Roster (gh89)**: removidos **Neymar** e **MEGA BRAIN** do seletor (voltam a 5 personagens)
- **Domar montarias mais fácil (gh85)**: basta ~28% de dano (HP ≤ 72%); ao enfraquecer o animal para de atacar; alcance de interação maior; mula/cavalo/dromedário/pônei/panda um pouco mais fracos

### Fixed
- **Solo no desktop (gh89)**: neve/grama do chão agora acompanham a estação (antes só gelo/flocos mudavam)
- **ESC no pause (gh84)**: apertar Esc de novo (ou o botão de pause no celular) retoma o jogo — não só o botão Continuar
- **Pointer lock (gh83)**: não tenta capturar o mouse logo após Esc (evita `SecurityError` no Chrome); promise tratada; hint “Clique para mirar”

### Added
- **Poções de vida (gh82)**: jarros mágicos com líquido vermelho no mapa (+ drops); restauram vida ao pegar
- **Montarias (gh82)**: cavalo (rápido), dromedário (tanque) e pônei — domar como mula/panda (E com vida baixa)

### Fixed
- **Travamentos graves (gh80/gh81)**: neve desktop não chama mais `groundHeight` por floco (era ~1400×/frame); menos flocos, shadow 1024, bloom leve, loot sem castShadow; auto-modo leve se o frame > 80ms; `.htaccess` força HTML sem cache + `console [Neve] build gh81` para confirmar o bundle
- **Lança na mão (gh79)**: reconstruída no eixo Y + braço em pose de estocada (não atravessa mais o torso)
- **Travamentos / console (gh79)**: `THREE.Clock` → `THREE.Timer`, `PCFSoftShadowMap` → `PCFShadowMap`; removidas dezenas de PointLights nos pickups; autosave adiado do frame crítico

### Removed
- **Personagem Ártico (gh78)**: removido do picker e de `faces/`; saves antigos com essa skin caem em Natan

### Added
- **Montarias estilo ARK (gh77)**: mula sem cabeça e panda podem ser **domados** (E com o animal abaixo de 40% de vida), **montados** (E de novo; WASD anda, Shift galopa, E desmonta) e **equipados com armadura** de placas (receita na fogueira: 2 latas + 2 cordas → corta o dano recebido pela metade). Montarias persistem no mid-run save; conquista "Domador da neve"

### Changed
- **Privacidade (gh76)**: nenhum domínio/host fica no repositório — APIs same-origin por padrão, hosts estáticos usam `SNOW_API_BASE` (secret injetado no build); docs com placeholders; smoke do relay só roda com `SIGNAL_URL` definido

### Added
- **Modos de mapa (gh75)**: seletor no boot após a dificuldade — **Classic** (layout fixo atual) e **Random** (terreno, lago, base e spawn derivados da seed). Persistido no mid-run save; no co-op o modo viaja no bit 31 da seed da sala (daily continua sempre Classic)
- **Raridade de loot**: anéis rare/epic nos pickups + partículas (armas/troféus)
- **Crafting na fogueira (C)**: materiais (corda, latas, isqueiro, mapa, bússola, rádio) → munição/armadilhas; cerca clássica como fallback
- **Husky companheiro**: opcional (desligado por padrão); liga/desliga no pause; fareja loot próximo
- **Eventos de mundo**: nevasca (visão/frio) e invasão noturna na base
- **Hardcore**: dificuldade com morte permanente, sem mid-run save; ranking marcado com ★
- **Dungeon cronometrada**: tempo de clear + melhor tempo local + conquista sob 4 min
- **Cutscenes de chefs**: Panda, Saci e T-Rex (mesmo runner do Boto)
- **Biomas locais**: floresta densa, montanha e clareira na densidade de árvores

### Fixed
- **Armas melee**: poses da claymore/relíquia/machado/tocha; lança com estocada (não atravessa o corpo)

### Added
- **Dungeon secreta**: caverna escondida em posição aleatória por seed (sem marcador no mapa) — ondas de inimigos, parkour, Guardião do Abismo e a arma exclusiva **Relíquia do Abismo** + conquista "Segredo do Abismo" (solo only; morrer reseta a dungeon)
- Botão **Ativar som** no mobile quando o AudioContext ainda está suspenso

### Changed
- HUD mobile redesenhado: só 4 ações na tela (correr, interagir, pular, atacar); resto no menu ⋯ (inclui chat)
- Tutorial e dicas no celular usam ícones de toque em vez de teclas WASD/E/Esc
- Minimapa, barras e timer compactos; legenda de armadilha/teclado escondida no touch
- **Performance mobile**: DPR≤1, sem antialias/bloom/sombras, menos neve/grama/vagalumes, minimapa ~8 Hz (evita engasgos a cada poucos segundos no Android)

### Fixed
- Áudio no **Android Chrome**: `unlockFromGesture()` síncrono (resume sem await), trilha procedural dedicada no mobile (sem HTMLAudio/MediaElementSource que silenciava), volumes um pouco mais altos
- Áudio no mobile: desbloqueio em todo toque; aviso só some com o som rodando de verdade
- Trilha desktop: WAVs via `decodeAudioData` + BufferSource (WebAudio puro), pausas curtas entre faixas

### Changed
- Organização do repositório: artes do splash em `assets/splash/`; guias `DEPLOY-SEGURO`, `GITHUB-PAGES` e `RELEASE-NOTES` em `docs/`
- Demo automática: navegação humana (desvio/pulo/strafe), tour da base e combate com orbit

### Removed
- Personagem de teste **HEROBRINE** (só validação do fluxo de deploy)

## [gh72] - 2026-07-26
### Added
- **Melhorias visuais de pickups**: Geometria mais detalhada (dobradiças, fechos, antenas), PointLights emissivas em itens-chave (munição, armadilhas, troféus, lanternas, armas), e sistema de partículas flutuantes sutis ao redor de armas e troféus para maior destaque visual

### Changed
- **Balanceamento de drops**: Redução significativa na quantidade e chance de munição dropada por inimigos eliminados (~40-50% menos munição), com suporte a ranges variáveis de quantidade ([min, max])

## [gh71] - 2026-07-25
### Added
- Playbook genérico de lições: [`docs/PLAYBOOK-JOGO-WEB.md`](docs/PLAYBOOK-JOGO-WEB.md) (reutilizável em projetos parecidos)
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
