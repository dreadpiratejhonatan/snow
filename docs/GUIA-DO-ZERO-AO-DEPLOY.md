# Do zero ao deploy — guia completo de reprodução

Este documento resume **tudo** que foi feito no projeto **Neve Selvagem** (jogo de
sobrevivência 3D no navegador), do primeiro commit até o pipeline de deploy
automático. Serve como passo a passo para qualquer pessoa reproduzir um projeto
parecido: jogo/app web estático + API PHP simples, hospedado na **HostGator** e no
**GitHub Pages**, com CI/CD via **GitHub Actions**.

> Nenhuma credencial aparece aqui. Tudo que é sensível vive em **GitHub Actions
> Secrets** (seção 8).

---

## 1. Stack e visão geral

| Camada | Tecnologia |
|--------|-----------|
| Jogo/3D | [Three.js](https://threejs.org/) (ES Modules) |
| Bundler | [esbuild](https://esbuild.github.io/) (bundle único minificado) |
| Dev server | [serve](https://www.npmjs.com/package/serve) |
| Testes | Scripts Node puros (smoke tests, sem framework) |
| Backend leve | PHP no HostGator (ranking, tickets, signaling co-op) |
| Hospedagem | HostGator (produção) + GitHub Pages (espelho estático) |
| CI/CD | GitHub Actions (build, smoke, deploy FTP, deploy Pages) |

Por que essas escolhas:
- **Sem framework de build pesado** — esbuild gera um `game.js` único em ~100ms.
- **Bundle único é obrigatório na HostGator** — o servidor bloqueia algumas pastas
  de vendor/lib; um arquivo só resolve.
- **PHP no shared hosting** — ranking online e co-op sem precisar de VPS.

## 2. Pré-requisitos

- Node.js 20+ (o CI usa 20 e 22)
- Git
- Conta no GitHub
- (Para produção) uma hospedagem com FTP — aqui, HostGator com cPanel

## 3. Começando do zero

```bash
mkdir meu-jogo && cd meu-jogo
git init
npm init -y
npm install three
npm install -D esbuild serve
```

`package.json` mínimo (o real do projeto):

```json
{
  "type": "module",
  "scripts": {
    "start": "serve -l tcp://127.0.0.1:5173",
    "build": "node scripts/build.mjs",
    "preview": "serve dist -l tcp://127.0.0.1:5180",
    "test:smoke": "node tests/smoke-test.mjs"
  }
}
```

### Estrutura de pastas

```
├── index.html            # entrada única (importmap do Three.js em dev)
├── src/
│   ├── js/               # módulos ES: main.js, world.js, player.js, config.js...
│   └── styles/styles.css
├── assets/               # imagens (splash etc.)
├── music/                # trilha (wav + manifest.json)
├── api/                  # PHP: leaderboard.php, signal.php, tickets.php
├── data/                 # JSONs vivos do servidor (ranking, tickets, salas co-op)
├── scripts/build.mjs     # build + pacote de deploy
├── tests/smoke-test.mjs  # testes de fumaça
├── docs/                 # toda a documentação
└── .github/workflows/    # CI/CD
```

Em **desenvolvimento**, o `index.html` usa um `importmap` apontando o Three.js do
`node_modules` e carrega `src/js/main.js` direto como módulo — sem build. Rodar:

```bash
npm start   # http://127.0.0.1:5173
```

## 4. Build (`scripts/build.mjs`)

Um script Node único faz tudo:

1. Limpa `dist/` e roda o esbuild:

```bash
npx esbuild src/js/main.js --bundle --format=esm --outfile=dist/game.js --minify
```

2. Reescreve o `index.html` do `dist/`: remove o importmap e troca
   `src/js/main.js?v=ghXX` por `game.js?v=ghXX`.
3. Copia `assets/`, `music/`, `api/`, `tickets/`, `faces/` e `data/`.
4. Gera `.htaccess` (MIME de `.js` + `no-cache` para HTML) e `.nojekyll`
   (impede o Jekyll do GitHub Pages de ignorar pastas).
5. Monta um **segundo pacote** em `release/hostgator-snow/` com o bundle em
   `src/js/bundle.js` (layout que a HostGator espera) e, no Windows, zipa em
   `release/snow.zip` para deploy manual.

### Cache busting (essencial!)

Uma constante `CACHE = "ghXX"` no build e query strings `?v=ghXX` no HTML forçam o
navegador a baixar o código novo a cada deploy. **Todo deploy incrementa a versão**
em 3 lugares:

- `scripts/build.mjs` → `const CACHE = "ghXX"`
- `index.html` → `styles.css?v=ghXX` e `main.js?v=ghXX`
- `CHANGELOG.md` → entrada da versão

Sem isso, usuários ficam presos em versões antigas por dias.

## 5. Smoke tests

`tests/smoke-test.mjs` roda o jogo **headless em Node** (o código foi escrito para
não depender do DOM na lógica): cria o mundo, simula o player, inimigos, itens,
drops, dungeon, e valida invariantes (spawn correto, colisores, configs presentes).

```bash
npm run test:smoke
```

Regra do projeto: **nenhum deploy sem smoke verde.** É rápido (~5s) e pega a
maioria das quebras de refactor.

## 6. Git e GitHub

### Branches

| Branch | Papel |
|--------|-------|
| `main` | estável; fonte do GitHub Pages |
| `develop` | integração contínua; cada push faz deploy na HostGator |
| `release/v1.0` | congelada na versão oficial (tag `v1.0.0`) |
| `feature/*` | trabalho pontual, merge na `develop` |

> A branch padrão foi **renomeada de `master` para `main`**:
> `git branch -m master main && git push -u origin main`, depois trocar a branch
> padrão em *Settings → Branches* no GitHub e apagar a `master` remota.

### Fluxo de trabalho

```bash
git checkout develop
# ... trabalho ...
npm run build && npm run test:smoke   # sempre antes de subir
git add -A && git commit -m "Descricao (ghXX)"
git push origin develop               # dispara CI + deploy HostGator
```

Se o push for rejeitado (trabalho paralelo), `git pull` e resolver conflitos —
no projeto, os conflitos recorrentes foram em `CHANGELOG.md` e na versão de cache
(resolver combinando as entradas e subindo **uma versão nova**).

## 7. Deploy manual na HostGator (primeira vez)

1. Rodar `npm run build` — gera `release/hostgator-snow/` e `release/snow.zip`.
2. No **cPanel → Gerenciador de Arquivos**, abrir `public_html/<pasta-do-site>`.
3. **Backup antes de tudo:** baixar `data/leaderboard.json` (e `tickets.json`).
4. Apagar somente `index.html`, `src/`, `api/`, `music/`, `assets/` antigos —
   **nunca apagar `data/`** (são os dados vivos: ranking, tickets, salas co-op).
5. Upload do zip e extrair.
6. Permissões: `data/` e `data/rooms/` em **755** (ou 775).
7. Criar `data/tickets-admin.key` no servidor (1 linha = senha do admin do board).
   Esse arquivo **nunca** vai para o Git — está no `exclude` do deploy.
8. Abrir o site com **Ctrl+F5** e conferir a versão de cache no fonte da página.

## 8. Deploy automático (GitHub Actions)

### Secrets necessários

Em *Settings → Secrets and variables → Actions*, criar:

| Secret | Conteúdo |
|--------|----------|
| `HOSTGATOR_FTP_HOST` | host do FTP |
| `HOSTGATOR_FTP_USER` | usuário do FTP |
| `HOSTGATOR_FTP_PASSWORD` | senha do FTP |
| `HOSTGATOR_FTP_DIR` | diretório remoto (ex.: `/public_html/snow/`) |

Até o **diretório remoto** fica em secret — o repositório público não revela nem a
estrutura do servidor.

### Workflow 1 — CI (`.github/workflows/ci.yml`)

Em cada push/PR na `main` ou `develop`: instala, builda e roda os smoke tests.

### Workflow 2 — Deploy HostGator (`.github/workflows/deploy-hostgator.yml`)

Em cada push na `develop`:

1. `npm ci` + `npm run build`
2. Sobe `release/hostgator-snow/` via `SamKirkland/FTP-Deploy-Action`

Pontos críticos da configuração:

```yaml
dangerous-clean-slate: false        # nunca apaga o servidor inteiro
exclude: |
  data/leaderboard.json             # dados vivos: o deploy NUNCA os sobrescreve
  data/tickets.json
  data/tickets-admin.key
  data/rooms/**
```

O action mantém um `.ftp-deploy-sync-state.json` no servidor para subir só o que
mudou (deploy incremental).

### Workflow 3 — GitHub Pages (`.github/workflows/deploy-pages.yml`)

Builda `dist/` e publica no Pages. **Atenção:** o Pages do repositório só aceita
deploy da branch configurada nas settings (aqui, `main`) — o job de Pages disparado
pela `develop` falha e **isso é esperado**; o deploy que importa (HostGator) é outro
workflow.

### Validando um deploy em produção

Produção serve o **bundle**, não os módulos:

1. Buscar `index.html` do site e conferir `?v=ghXX` novo.
2. Buscar `src/js/bundle.js?v=ghXX` e procurar uma string do código novo
   (ex.: nome de uma classe recém-criada).
3. Buscar módulos individuais dá **404** — normal, não existe `src/js/*.js` solto
   em produção.

## 9. Desenvolvimento pelo celular (Cursor Cloud Agent)

O projeto também aceita mudanças feitas **direto do celular**, usando o app do
[Cursor](https://cursor.com) com **Cloud Agents** — sem abrir o notebook. A mudança
feita no telefone chega em produção sozinha.

### Como funciona

1. No app do Cursor no celular, você abre o repositório e pede a mudança em
   linguagem natural (ex.: "diminua o dano do lobo").
2. O Cloud Agent trabalha numa VM própria, numa branch `cursor/*`, e abre um
   **Pull Request** no GitHub (muitas vezes contra `main`). O auto-merge
   retargeteia para `develop` — por isso o workflow precisa existir também na `main`.
3. Um workflow dedicado (`.github/workflows/auto-merge-cursor.yml`,
   "Auto-merge Cursor PRs") assume a partir daí:
   - Só age em branches que começam com `cursor/` (PRs humanos não são tocados)
   - Retargeteia o PR para `develop` se ele veio apontando para outra base
   - Marca PRs draft como prontos
   - **Espera o CI ficar verde** (polling nos check-runs, timeout de 15 min);
     se o CI falhar, o PR fica aberto para correção — nada é mergeado quebrado
   - Faz **squash-merge** na `develop` e apaga a branch
   - Dispara os deploys (HostGator + Pages) via `workflow_dispatch`
4. Minutos depois, a mudança está no site.

### Detalhe técnico importante

Merges feitos com o `GITHUB_TOKEN` **não disparam** workflows de push (proteção do
GitHub contra loops infinitos). Por isso o workflow chama os deploys explicitamente:

```bash
gh workflow run "Deploy HostGator" --ref develop
gh workflow run "Deploy GitHub Pages" --ref develop
```

Sem essas duas linhas, o auto-merge funcionaria mas o site nunca atualizaria.

### Permissões do workflow

```yaml
permissions:
  contents: write        # mergear
  pull-requests: write   # retarget / ready / merge do PR
  checks: read           # ler status do CI
  actions: write         # disparar os workflows de deploy
```

### Armadilha pós-renomeação de branch

Depois de renomear `master` → `main`, o environment `github-pages` continuou
permitindo deploy **apenas da `master`** — todo deploy do Pages falhava na hora.
Correção única (dá para fazer pelo próprio celular): *Settings → Environments →
github-pages → Deployment branches* → adicionar `main` e `develop`.

### Resumo do fluxo mobile

```
celular (app Cursor) → Cloud Agent → branch cursor/* → PR
     → auto-merge (espera CI) → squash na develop
     → dispatch deploys → HostGator + Pages atualizados
```

Guia detalhado no repositório: [`MOBILE-AUTO-PROD.md`](MOBILE-AUTO-PROD.md).

## 10. Segurança

- **Nenhuma credencial no código nem no histórico do Git.** Auditoria feita com
  busca por `password`, `secret`, `key`, `admin` etc. em todos os arquivos.
- Credenciais só em GitHub Actions Secrets; senha de admin dos tickets só em
  arquivo no servidor (excluído do deploy e do Git).
- Se uma senha vazar (ou for colada num chat/commit por engano): **trocar
  imediatamente** na origem e atualizar o secret.
- `.htaccess` protege `data/rooms/`; JSONs vivos nunca são clobberados pelo deploy.

## 11. Problemas reais encontrados (e soluções)

| Problema | Causa | Solução |
|----------|-------|---------|
| Deploy FTP "sobe" mas nada muda | `.ftp-deploy-sync-state.json` obsoleto após mexida manual no servidor | Apagar o arquivo de estado via FTP; próximo deploy ressincroniza tudo |
| Pages falha após renomear branch | Environment `github-pages` só permitia deploy da `master` antiga | Settings → Environments → github-pages → adicionar `main`/`develop` |
| Merge do bot não dispara deploy | Merges com `GITHUB_TOKEN` não geram eventos de push | Disparar os workflows via `gh workflow run` (workflow_dispatch) |
| Usuários vendo versão antiga | Falta de cache busting | `?v=ghXX` em CSS/JS + `no-cache` para HTML no `.htaccess` |
| Job do Pages falhando na `develop` | Pages só publica da `main` | Ignorar (esperado) ou restringir o workflow à `main` |
| 404 ao buscar módulos em produção | Produção serve bundle único | Validar pelo `bundle.js`, não pelos módulos |
| Conflito de CHANGELOG/cache | Duas frentes usando a mesma versão `ghXX` | Combinar entradas e subir versão nova |
| Push rejeitado (non-fast-forward) | Trabalho paralelo na `develop` | `git pull`, resolver, subir de novo |

## 12. Processo de release

1. Feature pronta na `develop` (build + smoke verdes, cache incrementado)
2. `CHANGELOG.md` e `docs/RELEASE-NOTES.md` atualizados
3. Push na `develop` → deploy automático na HostGator
4. Validar produção (seção 8)
5. Quando estável: merge `develop` → `main` (atualiza o GitHub Pages) e, em
   marcos, criar branch `release/vX.Y` + tag

## 13. Documentação do projeto

| Doc | Conteúdo |
|-----|----------|
| `docs/PLAYBOOK-JOGO-WEB.md` | Lições genéricas para projetos parecidos |
| `docs/DEPLOY-SEGURO.md` | Deploy HostGator preservando dados vivos |
| `docs/GITHUB-PAGES.md` | Setup do Pages |
| `docs/API.md` | Endpoints PHP (ranking, tickets, signaling) |
| `docs/COOP.md` | Arquitetura do multiplayer (WebRTC + relay) |
| `docs/V1-OFICIAL.md` | Escopo da versão 1.0 |
| `docs/DEVELOP-ATE-GH63.md` / `DEVELOP-GH64-ATE-GH73.md` | História do desenvolvimento |
| `CHANGELOG.md` | Toda versão de cache documentada |

---

## Resumo em 11 passos

1. `npm init` + Three.js + esbuild + serve
2. Código em módulos ES, `index.html` com importmap para dev sem build
3. Script de build único: bundle + cópias + cache busting + pacote de deploy
4. Smoke tests headless em Node — rodar antes de todo push
5. Repositório GitHub com `main` (estável) e `develop` (integração)
6. Primeira publicação manual via cPanel/FTP (backup de `data/` sempre!)
7. Secrets do FTP no GitHub Actions
8. Workflows: CI (build+smoke), deploy FTP na `develop`, Pages na `main`
9. Auto-merge de PRs `cursor/*` para editar pelo celular (Cursor Cloud Agent)
10. Todo deploy: incrementar `ghXX`, buildar, testar, push, validar produção
11. Documentar tudo (`CHANGELOG`, release notes, docs narrativos)
