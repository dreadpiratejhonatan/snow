# Neve Selvagem — Versão 1.0 oficial

**Data de corte:** 25 de julho de 2026  
**Tag Git:** `v1.0.0`  
**Branch de release:** `release/v1.0`  
**Cache do cliente (referência):** `?v=gh46`

Este documento é o mapa da **primeira versão oficial**: o que o jogo faz, onde roda, APIs, deploy e limites conhecidos.

---

## URLs de produção

| Ambiente | URL |
| --- | --- |
| GitHub Pages (front) | https://dreadpiratejhonatan.github.io/snow/ |
| HostGator (front + PHP) | https://jhonatanribeiro.com/snow/ |
| Board de sugestões | https://jhonatanribeiro.com/snow/tickets/ (Pages também em `/tickets/`) |
| Ranking API | `…/api/leaderboard.php` |
| Co-op API | `…/api/signal.php` |
| Tickets API | `…/api/tickets.php` |

No **GitHub Pages** o front é estático; ranking, co-op e tickets chamam a HostGator (CORS).

---

## O que é o jogo (v1)

Sobrevivência 3D na neve (Three.js no navegador). Explore, colete suprimentos, lute, gerencie frio/dia-noite e deposite no baú da cabana.

### Objetivo de vitória

1. Coletar os **suprimentos** do mapa  
2. Obter o **Troféu do Urso Alfa**  
3. Obter o **Troféu do Boto** (chefão final no lago)  
4. Depositar tudo no **baú** da base  

### Fluxo de entrada

1. Splash (artes `sc1`–`sc4` + fallback; **ordem aleatória** a cada visita)  
2. Personagem (preview 3D)  
3. Dificuldade: Fácil / Médio / Difícil  
4. Solo **ou** Com um amigo (co-op)  
5. Continuar save local (solo) se existir  

### Personagens

Natan, Jhonatan, Jorge Bolado, Caio, Lorenzo, **ZÉ** — rostos em `faces/`, cards embaralhados no picker.

### Dificuldade

Altera loot, HP/dano de inimigos, dano das armas e frio. **Médio** = balance padrão.

### Combate e mundo

- Arsenal: punhos, machado, lança, tocha, claymore, arco, besta, revólver, escopeta, AK-47, granada  
- Scroll do mouse cicla armas (pointer lock)  
- Cobertura: árvores, pedras, baú bloqueiam tiros e parte dos ataques corpo a corpo  
- Estações ciclam a cada 2 dias in-game (neve/gelo/frio)  
- Inimigos: ursos, lobos, lobisomem, mula-sem-cabeça, slender, Chuck + chefs **Panda**, **Saci**, **T-Rex gatling**, **Boto**  
- Armadilhas perto da fogueira (mina, isca, cerca)  
- Trilha procedural estilo aventura 16-bit (desbloqueia no clique dos menus)  

### Controles (PC)

| Tecla | Ação |
| --- | --- |
| WASD | mover |
| Shift | correr |
| Espaço | pular |
| E | pegar / depositar |
| Mouse / IJKL | olhar |
| Scroll | ciclar arma |
| B | barra de armas |
| 1–9 / 0 | equipar |
| G / F | tipo / colocar armadilha |
| V / Tab | 1ª / 3ª pessoa |
| Alt + setas | orbitar câmera (3ª pessoa) |
| R | recarregar |
| C | craft cerca (fogueira) |
| T | ranking |
| H / ? | ajuda / FAQ |
| N | novidades |
| Esc | pausa |

Touch no celular: stick + botões.

### Dedicatória

**CAIO** (primeiro a testar) e **JORGE** (primeiro a zerar).

---

## Co-op (2 jogadores)

Detalhes operacionais: [`COOP.md`](COOP.md).

- Host cria sala → código de 6 caracteres → guest entra  
- Host é autoritativo (inimigos / snapshots)  
- Preferência: **WebRTC DataChannel** (STUN + TURN/TURNS)  
- Se P2P/firewall falhar (~8s): **relay HTTPS** automático via `api/signal.php`  
- Salas em `data/rooms/{CODE}.json`, TTL 30 min  
- Solo mantém save local e ranking; co-op é sessão em tempo real  

Smoke de relay:

```bash
node tests/coop-relay-smoke.mjs
```

---

## Board de sugestões (tickets)

- UI estilo Jira em `/tickets/` (colunas: Aberto / Em progresso / Feito / Não faremos)  
- Público: criar feature/bug e ver cards dos outros  
- Admin: senha em `data/tickets-admin.key` (1 linha; **não** versionar; HTTP bloqueado por `data/.htaccess`)  
- Persistência: `data/tickets.json`  

---

## Ranking

- Tecla **T** / painel de vitória  
- `api/leaderboard.php` → `data/leaderboard.json`  
- Filtros anti-cheat básicos (tempo mínimo, nomes lixo)  
- Cache local no browser se a API cair  

---

## APIs PHP

Referência completa: [`API.md`](API.md).

| Arquivo | Função |
| --- | --- |
| `api/leaderboard.php` | ranking |
| `api/signal.php` | co-op signaling + relay |
| `api/tickets.php` | sugestões / bugs |

Pasta `data/` no servidor: **não apagar** em deploys. Ver [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md).

---

## Repositório e branches

| Branch / tag | Papel |
| --- | --- |
| `main` | linha principal / Pages |
| `release-notes` | espelho usado no desenvolvimento recente (manter alinhada) |
| `release/v1.0` | **corte oficial da v1.0** |
| `v1.0.0` | tag anotada da release |

Repo: https://github.com/dreadpiratejhonatan/snow

---

## Build e deploy

```bash
npm install
npm run build          # dist/ + release/hostgator-snow/ + release/snow.zip
npm run test:smoke
node tests/coop-relay-smoke.mjs
```

- **Pages:** push em `main` → GitHub Actions publica `dist/`  
- **HostGator:** subir `release/snow.zip` **sem** sobrescrever `data/leaderboard.json` / `data/tickets.json`  

Zip local típico: `release/snow.zip`

---

## Documentação irmã

| Arquivo | Conteúdo |
| --- | --- |
| [`../README.md`](../README.md) | visão geral + como rodar |
| [`RELEASE-NOTES.md`](RELEASE-NOTES.md) | changelog jogável v1 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | histórico versionado |
| [`COOP.md`](COOP.md) | multiplayer |
| [`API.md`](API.md) | contratos HTTP |
| [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md) | HostGator sem perder dados |
| [`GITHUB-PAGES.md`](GITHUB-PAGES.md) | publicação Pages |
| [`FASE2-BACKLOG.md`](FASE2-BACKLOG.md) | ideias pós-v1 |

---

## Limites conhecidos

- Co-op (develop+): até **3** jogadores; 3P só via relay HTTPS  
- Host/guest podem **reconectar no mesmo aparelho** (`hostKey` / `guestKey`) — não mid-run automático  
- Relay HTTPS funciona atrás de firewall, com latência maior que P2P  
- TURN público (openrelay) é best-effort; o fallback confiável é o relay HostGator  
- Não há conta de usuário — ranking/tickets são abertos (com moderação manual de tickets)  
- Save mid-run é local (solo); co-op não substitui o save clássico  

---

## Créditos de implementação (marco v1)

Entregue entre ~19–25 jul 2026: menus, dificuldade, chefs, personagens (incl. ZÉ), ranking HostGator, co-op com rejoin/ICE/relay HTTPS, tickets board, estações, cobertura de tiros, OST procedural, splash aleatória, deploys Pages + HostGator.
