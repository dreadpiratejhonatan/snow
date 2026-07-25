# Neve Selvagem — v1.0 oficial

Sobrevivência 3D na neve no navegador (Three.js). Explore, colete suprimentos, enfrente criaturas e chefs, dispute o ranking e jogue co-op com um amigo.

**Documentação completa da v1:** [`docs/V1-OFICIAL.md`](docs/V1-OFICIAL.md)  
**Changelog:** [`CHANGELOG.md`](CHANGELOG.md) · **Novidades in-game:** [`RELEASE-NOTES.md`](RELEASE-NOTES.md)

| Jogar | URL |
| --- | --- |
| GitHub Pages | https://dreadpiratejhonatan.github.io/snow/ |
| HostGator | https://jhonatanribeiro.com/snow/ |
| Sugestões | [/tickets/](https://jhonatanribeiro.com/snow/tickets/) |

**Release Git:** branch `release/v1.0` · tag `v1.0.0` (25 jul 2026)

---

## O jogo (resumo)

- Splash com artes aleatórias → personagem → dificuldade → **Solo** ou **Com um amigo**
- Colete suprimentos + **Troféu do Urso Alfa** + **Troféu do Boto** e deposite no **baú**
- Arsenal completo, armadilhas, cobertura atrás de pedras/árvores, estações do ano
- Chefs: Panda, Saci, T-Rex gatling, Boto (lago)
- Personagens: Natan, Jhonatan, Jorge Bolado, Caio, Lorenzo, ZÉ
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

No celular: stick + botões.

---

## Rodar localmente

```bash
npm install
npm run start:win   # Windows
# ou: npm start
```

Abra http://127.0.0.1:5173/

## Build, testes e deploy

```bash
npm run build
npm run test:smoke
npm run test:coop-relay   # HostGator signal/relay ao vivo
npm run preview           # dist/ em :5180
```

- **HostGator (seguro):** [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md) — zip em `release/snow.zip`  
- **GitHub Pages:** [`GITHUB-PAGES.md`](GITHUB-PAGES.md)  
- **Co-op:** [`docs/COOP.md`](docs/COOP.md)  
- **APIs:** [`docs/API.md`](docs/API.md)

O pacote **não inclui** ranking/tickets vivos — preserve `data/` no servidor.

---

## Estrutura

```
web-cs/
├── index.html          # shell + menus + splash
├── src/js/             # game, net/, splash, …
├── src/styles/
├── api/                # leaderboard, signal, tickets (PHP)
├── tickets/            # board público de sugestões
├── data/               # dev + .htaccess (produção no servidor)
├── docs/               # V1-OFICIAL, API, COOP, …
├── tests/
├── scripts/build.mjs
├── dist/               # build Pages
└── release/snow.zip    # pacote HostGator
```

## Branches

| Branch | Uso |
| --- | --- |
| `master` | desenvolvimento / Pages |
| `release/v1.0` | corte da primeira versão oficial |
| `release-notes` | espelho histórico do ciclo jul/2026 |
