# Neve Selvagem

Sobrevivência 3D na neve no navegador (Three.js). Explore, colete suprimentos, arme-se, enfrente criaturas e dispute o ranking de tempo.

Site de produção típico: HostGator em `/snow` com API PHP para o leaderboard.

## O jogo

- **Explore** o mapa nevado (minimapa orientado à sua frente, gelo escorregadio, dia/noite, aurora).
- **Colete 9 suprimentos** + o **Troféu do Urso Alfa** e deposite tudo no **baú** da cabana para vencer.
- **Arsenal**: punhos, machado, lança, tocha, claymore, arco, besta, revólver, escopeta, AK-47, granada. Munição no chão também libera a arma correspondente.
- **Inimigos**: ursos, lobos, lobisomem, mula-sem-cabeça, slender, Chuck — spawns atrasados; NPCs podem brigar entre si.
- **Armadilhas** perto da fogueira: mina, isca, cerca (`G` tipo / `F` colocar).
- **Skins**, tutorial, 1ª/3ª pessoa, touch no celular, speedrun + ranking.
- **Dedicado a CAIO** (primeiro a testar) e **JORGE** (primeiro a zerar).

### Controles

| Tecla | Ação |
| --- | --- |
| WASD | mover |
| Shift | correr |
| Espaço | pular |
| E | pegar / depositar no baú |
| IJKL | olhar a câmera sem mouse |
| B | inventário de armas |
| 1–9 / 0 | equipar arma |
| G / F | tipo / colocar armadilha |
| V / Tab | 1ª / 3ª pessoa |
| R | recarregar (revólver / escopeta / AK) |
| C | craft cerca (perto da fogueira; gasta 1 da mochila) |
| H / ? | ajuda e FAQ |
| Clique | atacar |
| Esc | pausar (ou pular tutorial) |

Progresso auto-salva (Continuar / Novo jogo após o splash).

No celular: stick + botões (incluindo `?` de ajuda).

### FAQ rápido (também in-game com H)

- **Flechas sem arco?** Flechas liberam o arco — abra o inventário (`B`).
- **Morri e perdi tudo?** O carregado cai no chão; o baú fica seguro.
- **Ranking?** Vença e envie o nome no painel de vitória (API no HostGator).

## Rodar localmente

```bash
npm install
npm run start:win   # Windows
# ou: npm start
```

Abra http://127.0.0.1:5173/

## Build e deploy

```bash
npm run build         # dist/ + release/hostgator-snow/ + release/snow.zip
npm run preview       # testa dist/ em :5180
npm run pages:preview # build + preview (igual GitHub Pages)
npm run test:smoke
```

### Co-op 2 jogadores

Menu após a skin: **Criar sala** / **Entrar** com código. Signaling na HostGator (`api/signal.php`), sync via WebRTC. Detalhes: [`docs/COOP.md`](docs/COOP.md).

### GitHub Pages (jogar online de graça)

Guia completo: [`GITHUB-PAGES.md`](GITHUB-PAGES.md).

1. Crie um repo no GitHub e faça push desta pasta `web-cs`
2. **Settings → Pages → Source: GitHub Actions**
3. O workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) publica o `dist/`
4. URL: `https://SEU_USER.github.io/SEU_REPO/`

No Pages o ranking usa a API da HostGator (CORS). Abra a lista com **T**.

### HostGator

Leia [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md) e o `LEIA-ME.txt` dentro do zip.

- O pacote **não inclui** `data/leaderboard.json` — para não apagar o ranking no upload.
- Preserve a pasta `data/` no servidor. Ctrl+F5 após publicar.

## Estrutura

```
web-cs/
├── index.html
├── src/js/          # main, world, player, weapons, enemies, tutorial, …
├── src/styles/
├── api/             # leaderboard.php
├── data/            # leaderboard local (dev)
├── scripts/build.mjs
├── tests/
├── dist/
└── release/snow.zip
```

## Testes

```bash
npm run test:smoke
npm run test:browser   # Chrome/Edge; GAME_URL=http://127.0.0.1:5180/ para dist
```
