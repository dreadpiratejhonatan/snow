# Neve Selvagem — v1.0 oficial

Sobrevivência 3D na neve no navegador (Three.js). Explore, colete suprimentos, enfrente criaturas e chefs, dispute o ranking e jogue co-op com um amigo.

**Documentação completa da v1:** [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md)  
**Ciclo pós-v1 (até gh63):** [`docs/DEVELOP-ATE-GH63.md`](docs/DEVELOP-ATE-GH63.md)  
**Changelog:** [`CHANGELOG.md`](CHANGELOG.md) · **Novidades in-game:** [`docs/RELEASE-NOTES.md`](docs/RELEASE-NOTES.md)

| Jogar | URL |
| --- | --- |
| GitHub Pages | https://SEU-USUARIO.github.io/snow/ |
| HostGator | https://SEU-DOMINIO.com/snow/ |
| Sugestões | [/tickets/](https://SEU-DOMINIO.com/snow/tickets/) |

**Release Git:** branch `release/v1.0` · tag `v1.0.0` (25 jul 2026)

---

## O jogo (resumo)

- Splash com artes aleatórias → personagem → dificuldade → **Solo** ou **Com um amigo**
- Colete suprimentos + **Troféu do Urso Alfa** + **Troféu do Boto** e deposite no **baú**
- Arsenal completo, armadilhas, cobertura atrás de pedras/árvores, estações do ano
- Chefs: Panda, Saci, T-Rex gatling, Boto (lago)
- Personagens: Natan, Jorge Bolado, Caio, Lorenzo, ZÉ
- Ranking online (**T**), board de sugestões, trilha procedural
- Dedicado a **CAIO** (primeiro a testar) e **JORGE** (primeiro a zerar)

### Controles

| Tecla | Ação |
| --- | --- |
| WASD | mover |
| Shift | correr |
| Espaço | pular |
| E | pegar / depositar |
| Scroll | ciclar arma |
| B | barra de armas |
| 1–9 / 0 | equipar |
| G / F | tipo / colocar armadilha |
| V / Tab | 1ª / 3ª pessoa |
| R | recarregar |
| T | ranking |
| H / ? | ajuda |
| N | novidades |
| Esc | pausa |

No celular: stick + 4 ações (correr / interagir / pular / atacar); **⋯** abre o resto.

---

## Rodar localmente

```bash
npm install
npm run start:win   # Windows
# ou: npm start
```

Abra http://127.0.0.1:5173/

**Demo automática (espectável):** menu **Assistir demo**, ou `http://127.0.0.1:5173/?demo=1` — player robô joga sozinho em 3ª pessoa (Esc cancela).

## Build, testes e deploy

```bash
npm run build
npm run test:smoke
npm run test:coop-relay   # HostGator signal/relay ao vivo
npm run preview           # dist/ em :5180
```

- **HostGator (seguro):** [`docs/DEPLOY-SEGURO.md`](docs/DEPLOY-SEGURO.md) — zip em `release/snow.zip`  
- **GitHub Pages:** [`docs/GITHUB-PAGES.md`](docs/GITHUB-PAGES.md)  
- **Co-op:** [`docs/COOP.md`](docs/COOP.md)  
- **Pós-v1 / o que foi feito:** [`docs/DEVELOP-ATE-GH63.md`](docs/DEVELOP-ATE-GH63.md)  
- **APIs:** [`docs/API.md`](docs/API.md)  
- **Playbook genérico (lições para projetos parecidos):** [`docs/PLAYBOOK-JOGO-WEB.md`](docs/PLAYBOOK-JOGO-WEB.md)

O pacote **não inclui** ranking/tickets vivos — preserve `data/` no servidor.

---

## Estrutura

```
/
├── README.md           # visão geral do projeto
├── CHANGELOG.md
├── package.json
├── index.html          # entry (dev) — shell + menus
├── assets/splash/      # artes do launcher
├── src/js/             # game, net/, splash, …
├── src/styles/
├── api/                # leaderboard, signal, tickets (PHP)
├── tickets/            # board público de sugestões
├── music/              # OST / manifest
├── faces/              # texturas de personagem
├── data/               # dev + .htaccess (produção no servidor)
├── docs/               # guias (deploy, Pages, API, COOP, …)
├── scripts/            # build, gen-music, …
├── tests/
├── .github/workflows/  # CI + deploy FTP / Pages
├── dist/               # build Pages (gerado)
└── release/            # pacote HostGator (gerado)
```

## Branches

| Branch | Uso |
| --- | --- |
| `main` | linha principal / GitHub Pages |
| `develop` | desenvolvimento contínuo (HostGator FTP) |
| `release/v1.0` | corte da primeira versão oficial |
| `release-notes` | espelho histórico do ciclo jul/2026 |
