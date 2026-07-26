# Novidades — v1.0 oficial (jul 2026)

Primeira versão oficial do **Neve Selvagem**. No jogo: botão **N** (ao lado do `?`; touch no celular) ou **O que mudou** no pause.

Documentação completa: [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md) · Tag Git: `v1.0.0` · Branch: `release/v1.0`

## Atualizações recentes (pós-v1.0)

### [gh73] — Correções de armas (26 jul 2026)
- **Lança de gelo**: Posição e rotação corrigidas — agora é segurada horizontalmente e não atravessa mais o corpo do personagem

### [gh72] — Melhorias visuais e balanceamento (26 jul 2026)
- **Itens mais atraentes**: Geometria detalhada (dobradiças, fechos, antenas), luzes emissivas (PointLights) em munição, armadilhas, troféus, lanternas e armas
- **Partículas flutuantes**: Sistema sutil de partículas ao redor de armas e troféus para maior destaque visual
- **Economia de munição**: Redução de ~40-50% na quantidade e chance de munição dropada por inimigos eliminados (balanceamento para aumentar tensão)
- **Drops variáveis**: Suporte a ranges [min, max] para quantidades de drops (ex: 2-3 balas ao invés de quantidade fixa)

### [gh71] — Dungeon secreta e áudio mobile (25 jul 2026)
- **Dungeon secreta**: Caverna escondida (posição aleatória por seed, sem marcador) com ondas de inimigos, parkour, Guardião do Abismo e arma exclusiva **Relíquia do Abismo** + conquista "Segredo do Abismo" (solo only)
- **Áudio mobile corrigido**: Desbloqueio síncrono no Android Chrome, trilha procedural dedicada para mobile, botão "Ativar som" quando AudioContext suspenso

---

## Pickups e combate
- Itens no chão com silhuetas próprias + partículas/flash ao pegar
- NPCs: flash vermelho, knockback, startle no aggro; SFX de hurt/teleporte/gatling
- Árvores, pedras e baú **bloqueiam tiros** e parte dos ataques (cobertura)
- Scroll do mouse cicla armas

## Menus de entrada
- Splash com artes em **ordem aleatória**
- Visual unificado (tipografia + noite gelada)
- Co-op em **2 passos**: Solo **ou** Com um amigo → criar/entrar

## Dificuldade e chefs
- Picker **Fácil / Médio / Difícil** depois da skin (Médio = balance padrão)
- Chefs: **Panda**, **Saci-pererê**, **T-Rex gatling**, **Boto-cor-de-rosa** (último, no lago)
- Vitória exige **Troféu do Urso Alfa** + **Troféu do Boto**

## Personagens
- **Natan**, **Jhonatan**, **Jorge Bolado**, **Caio**, **Lorenzo**, **ZÉ**
- Preview 3D; cards em ordem aleatória; rosto só na frente da cabeça

## Mundo e áudio
- **Estações** ciclam (neve/gelo/frio)
- Trilha procedural estilo aventura 16-bit (desbloqueia no clique dos menus)

## Inventário e ranking
- Tecla **B** mostra/esconde a barra de armas
- Ranking online (**T**) via HostGator; filtros anti-tempo-falso

## Board de sugestões
- `/tickets/` em cards estilo Jira — ideias públicas; admin muda status

## Multiplayer e deploy
- Co-op 2 jogadores (WebRTC + `api/signal.php`)
- Se firewall/NAT bloquear P2P → **relay HTTPS** automático (~8s)
- GitHub Pages + HostGator (`DEPLOY-SEGURO.md` — não apagar `data/`)
