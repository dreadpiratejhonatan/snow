# Novidades — v1.0 oficial (jul 2026)

Primeira versão oficial do **Neve Selvagem**. No jogo: botão **N** (ao lado do `?`; touch no celular) ou **O que mudou** no pause.

Documentação completa: [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md) · Tag Git: `v1.0.0` · Branch: `release/v1.0`

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
- **Natan**, **Jhonatan**, **Jorge Bolado**, **Caio**, **Lorenzo**, **ZÉ**, **HEROBRINE**
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
