# Novidades — v1.0 oficial (jul 2026)

Primeira versão oficial do **Neve Selvagem**. No jogo: botão **N** (ao lado do `?`; no celular: **⋯ → N**) ou **O que mudou** no pause.

Documentação completa: [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md) · Tag Git: `v1.0.0` · Branch: `release/v1.0`

## Atualizações recentes (pós-v1.0)

### [gh97] — Balões espaçados (8 ago 2026)
- Balões de fala e sussurros com intervalos **aleatórios médios/longos** (sem spam no relógio)

### [gh96] — Sussurros Bebe bebe (8 ago 2026)
- Sussurros místicos corrigidos para **“Bebe, bebe”** (português do Brasil)

### [gh95] — Sussurros no vento (8 ago 2026)
- Quatro áudios místicos filtrados sussurram ao acaso enquanto você joga

### [gh94] — Robertson + balões de fala (8 ago 2026)
- Novo personagem **Robertson** (velho bravo) no seletor; também spawna no mundo e briga com todo mundo
- **Balões de fala** seguem personagens e NPCs próximos com conversa aleatória

### [gh92] — Splash responde no celular (26 jul 2026)
- Toque na splash volta a funcionar: o mundo só carrega depois do “continuar” (sumia o travamento no Android)

### [gh91] — Hotbar mobile de volta (26 jul 2026)
- Barra de armas volta a aparecer no celular, acima do stick/botões (sem cobrir os controles)

### [gh90] — HUD mobile sem sobreposição (26 jul 2026)
- Tutorial, barras de vida/frio e controles touch não se empilham mais no celular

### [gh89] — Roster e solo sazonal (26 jul 2026)
- Removidos **Neymar** e **MEGA BRAIN** do seletor (ficam Natan, Jorge Bolado, Caio, Lorenzo e ZÉ)
- **Solo e vegetação** mudam de cor com as estações (primavera/verão/outono/inverno), também no desktop

### [gh82] — Poções e montarias (26 jul 2026)
- **Poções de vida**: jarros com líquido vermelho espalhados pelo mapa — pegue para curar
- **Novas montarias**: cavalo (galope rápido), dromedário (resistente) e pônei — enfraqueça e aperte **E** para domar/montar

### [gh78] — Personagens (26 jul 2026)
- Removido o personagem **Ártico** do seletor (ficam Natan, Jorge Bolado, Caio, Lorenzo e ZÉ)

### [gh77] — Montarias (26 jul 2026)
- **Dome e monte** a mula sem cabeça e o panda: enfraqueça o animal (vida < 40%) e aperte **E**
- Montado: WASD anda, **Shift galopa** (mula é veloz, panda é tanque), **E** desmonta
- **Armadura de montaria** (estilo ARK): craft na fogueira (2 latas + 2 cordas) e equipe com **E** — dano recebido cai pela metade
- Montarias ficam onde você as deixa, regeneram devagar e são salvas na expedição

### [gh75] — Modos de mapa (26 jul 2026)
- **Classic**: o mapa fixo de sempre (base, lago e spawn nos lugares conhecidos)
- **Random**: terreno, lago, base e spawn únicos por seed — cada partida nova é um mapa diferente
- Escolha no boot (após a dificuldade); salva no mid-run e sincroniza no co-op; o desafio diário continua sempre Classic

### [gh74] — Pacote grande de features (26 jul 2026)
- **Crafting** na fogueira (C): materiais → munição/armadilhas
- **Husky** companheiro (opcional, **desligado por padrão**) — liga no pause; fareja loot
- **Eventos**: nevasca e invasão noturna
- **Hardcore** (morte permanente) + ranking ★
- **Dungeon cronometrada** + cutscenes Panda/Saci/T-Rex
- **Biomas** locais + raridade de loot + poses de armas melee

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
- **Natan**, **Jorge Bolado**, **Caio**, **Lorenzo**, **ZÉ**, **Robertson**
- Preview 3D; cards em ordem aleatória; rosto só na frente da cabeça

## Mundo e áudio
- **Estações** ciclam (neve/gelo/frio)
- Trilha procedural estilo aventura 16-bit (desbloqueia no clique dos menus)

## Inventário e ranking
- Tecla **B** mostra/esconde a barra de armas
- Ranking online (**T**) via HostGator; filtros anti-tempo-falso

## Celular (HUD touch)
- Só **4 ações** na tela: correr, interagir, pular, atacar (+ stick)
- Pause e **⋯** no canto; câmera, armas, armadilhas, chat, ajuda e novidades no menu
- Tutorial e dicas usam ícones de toque (não WASD/Esc)
- Minimapa/status/timer compactos; legenda de teclado escondida
- **Performance**: no celular desliga bloom/sombras pesadas, limita DPR e reduz neve — evita engasgos periódicos

## Board de sugestões
- `/tickets/` em cards estilo Jira — ideias públicas; admin muda status

## Multiplayer e deploy
- Co-op 2 jogadores (WebRTC + `api/signal.php`)
- Se firewall/NAT bloquear P2P → **relay HTTPS** automático (~8s)
- GitHub Pages + HostGator (`DEPLOY-SEGURO.md` — não apagar `data/`)
