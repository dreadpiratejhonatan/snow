# Playbook: o que aprendemos fazendo um jogo web

Guia **genérico** para projetos parecidos: jogo 3D/2D no navegador, repo no GitHub, site estático e/ou PHP em hospedagem compartilhada, deploy automático, co-op e polish contínuo.

Use este documento em **qualquer** jogo ou app web no mesmo espírito — não depende do nome do produto.

---

## 1. Visão geral do tipo de projeto

| Peça | Papel típico |
| --- | --- |
| Cliente (JS + WebGL/Canvas) | O jogo em si |
| Build (esbuild/Vite/etc.) | Bundle para produção |
| GitHub | Código, CI, Pages (opcional) |
| Hospedagem (cPanel/FTP) | Front + APIs PHP + dados vivos |
| Actions Secrets | Senhas FTP / tokens (nunca no git) |

**Lição:** separar o que é *código versionado* do que é *dado vivo no servidor* (ranking, tickets, salas). Deploy nunca deve apagar o que os jogadores já geraram.

---

## 2. Organização do repositório

### Raiz limpa

Na raiz, deixe o essencial:

- `README.md`, `CHANGELOG.md`, `package.json`, entry (`index.html`)
- Pastas de código: `src/`, `api/`, `docs/`, `scripts/`, `tests/`
- Assets em pastas (`assets/`, `music/`, …) — **não** soltar dezenas de JPEG/MD soltos na raiz

### Docs

- Guias longos em `docs/`
- Links claros no `README`
- Evite duplicar a mesma informação em 5 arquivos; um guia canônico + links

### Branch padrão

Prefira **`main`** (não `master`). Atualize:

- default branch no GitHub
- workflows (`on.push.branches`)
- README / docs

`develop` (ou similar) para integração contínua + deploy de staging/produção se fizer sentido.

---

## 3. Cache do cliente (`?v=…`)

Browsers e CDNs cacheiam JS/CSS agressivamente.

**Padrão que funciona:**

1. Constante de build, ex.: `CACHE = "gh67"`
2. HTML referencia `bundle.js?v=gh67` e `styles.css?v=gh67`
3. A cada release visível, **suba o número**

Isso não é semver do jogo — é só “force refresh”. Documente no changelog qual cache está ao vivo.

---

## 4. CI vs deploy

| Conceito | O que é |
| --- | --- |
| **CI** (Continuous Integration) | Em todo push/PR: instalar, buildar, rodar testes rápidos |
| **Deploy** | Publicar artefato no Pages / FTP / servidor |

Não misture mentalmente: CI verde ≠ site atualizado. Deploy é outro workflow (ou outro job).

### Smoke tests

Testes **rápidos** (“se soltar fumaça, algo está muito errado”):

- construir mundo / simular frames em Node
- pingar API de co-op ou healthcheck
- **não** substituem jogar no celular/PC

Use `continue-on-error` só se um smoke for flaky por rede externa — e trate isso como dívida, não como normal.

---

## 5. Deploy seguro (hospedagem compartilhada + FTP)

### Conta FTP dedicada

- Usuário só para deploy, jail na pasta do jogo quando possível
- Senha **forte**, só em GitHub Actions Secrets
- Docs públicos listam **nomes** dos secrets, **nunca** usuário/senha/IP reais

### Preservar dados vivos

No upload, **exclua** (ou nunca sobrescreva):

- `leaderboard.json`, `tickets.json`, chaves admin
- pastas de salas / rate-limit

No guia de deploy manual: “apague código, **não** apague `data/`”.

### Armadilha do sync state (FTP-Deploy)

Ferramentas tipo `FTP-Deploy-Action` guardam `.ftp-deploy-sync-state.json` no servidor.

Se alguém **apagar os arquivos no File Manager** mas o JSON de sync permanecer:

- o Action “passa” (verde)
- compara com o estado antigo → **upload 0 bytes**
- o site fica 403/404

**Recuperação:** apagar o `.ftp-deploy-sync-state.json` (e/ou forçar reupload) e disparar o deploy de novo.

### Validar depois do deploy

Não confie só no ✅ do Actions:

```text
HEAD/GET no index.html
HEAD no bundle.js?v=ATUAL
Conferir string de versão no HTML
```

---

## 6. Secrets e higiene

Checklist antes de deixar o repo público (ou a cada ciclo):

- [ ] Nenhum `.env`, `.pem`, `*.key` de produção no git
- [ ] `.gitignore` cobre `.env*`, chaves admin, artefatos locais
- [ ] Placeholder no código (`CHANGE_ME_…`) **rejeitado** em runtime até configurar no servidor
- [ ] Histórico Git: se vazou senha de verdade → **rotacionar** (trocar senha) vale mais que reescrever histórico no começo
- [ ] Docs sem credenciais; exemplos genéricos (“usuário FTP de deploy”)

Senhas coladas em chat/PR também contam como vazamento — trate como comprometidas.

---

## 7. GitHub Pages + API em outro host

Pages = estático. Ranking/co-op/tickets precisam de backend.

Padrão:

- cliente no Pages aponta CORS para `https://seu-dominio/api/…`
- se API cair, degradar com cache local (`localStorage`) quando fizer sentido
- documentar o que **não** funciona só no Pages

---

## 8. Co-op no navegador (WebRTC + signaling)

Aprendizados úteis:

- Signaling barato (PHP + arquivos/JSON ou Redis) no mesmo host do jogo
- WebRTC P2P falha em muitos NATs → **relay HTTPS** como fallback
- Limite de jogadores e salas efêmeras em disco
- Reconnect no meio da run > “volte ao menu e recrie o mundo”
- Teste de relay separado (`test:coop-relay`) contra produção

TURN em VPS é opcional e caro de operar — documente quando realmente precisa.

---

## 9. Gameplay / engenharia do jogo

### Colisão ≠ mesh visual

Se o jogador anda em cima de um telhado em forma de cone/pirâmide:

- um collider **plano** na altura da caixa faz as pernas atravessarem o mesh
- calcule altura andável pela **distância ao pico** (ou use mesh collider / várias amostras)

Sempre valide climb em 3ª pessoa olhando os pés.

### Input unificado

Um objeto `Input` (teclado + touch + “virtual”) alimenta o mesmo `player.update`.

Isso permite:

- mobile com stick
- **demo bot** que escreve as mesmas flags (`moveForward`, `interact`, `leftHeld`)
- testes de smoke que simulam frames

### Demo / player automático espectável

Padrão que funcionou:

1. Entrada: `?demo=1` **e** botão no menu
2. Pular splash/pickers; dificuldade fácil; câmera 3ª pessoa
3. FSM: loot → baú → mostrar gear → chefs → vitória
4. Esc cancela e devolve o controle
5. **Não deixar o splash visível no HTML** — se pular `runSplash()`, chame `dismissSplash()` / esconda `#splash` (senão a UI fica pedindo clique para sempre)

Splash vem “ligado” no HTML por padrão: modo demo precisa escondê-lo **antes** do bundle terminar de pensar.

### Tutorial e overlays

Menus e banners com `hidden` + `aria-hidden`. Em fluxos automáticos (demo, deep-link), feche todos os overlays que bloqueiam o canvas.

---

## 10. Mobile e produção

- Testar no celular real, não só no DevTools
- Touch: stick + botões; pointer lock não existe como no desktop
- Áudio muitas vezes exige gesto do usuário — demos podem seguir sem áudio
- URL de produção com query (`?demo=1`) é ótima para QA rápida
- Cache no mobile é teimoso → bump `?v=` + hard refresh

---

## 11. Fluxo de trabalho com agentes / PRs automáticos

Se usar bots que abrem PR e auto-merge:

- `develop` muda rápido — sempre `pull --rebase` antes de push
- Conflitos em `index.html` / workflows são comuns (cache `?v=`, branches)
- Não assuma que “commit local” = “no ar”; confira o Actions e o HTTP

---

## 12. Checklist de release (copiável)

```text
[ ] Branch atualizada com origin
[ ] npm run build OK
[ ] Smoke local OK
[ ] Cache ?v= incrementado
[ ] Secrets só no GitHub (docs sem credenciais)
[ ] Deploy workflow verde
[ ] GET index + bundle na URL de produção
[ ] Smoke manual: menu, 1 feature crítica, mobile se possível
[ ] data/ no servidor intacta (ranking/tickets)
[ ] CHANGELOG / release notes atualizados se for release humana
```

---

## 13. Armadilhas (resumo)

| Sintoma | Causa comum | Ação |
| --- | --- | --- |
| Site 403/404 após “deploy OK” | Sync FTP desatualizado / pasta errada | Apagar `.ftp-deploy-sync-state.json`, redeploy, listar FTP |
| Jogador antigo após release | Cache JS/CSS | Bump `?v=` |
| Demo presa no splash | Overlay não escondido | `dismissSplash()` + classe early-boot |
| Pernas no telhado | Collider flat vs mesh inclinado | Altura por distância ao pico |
| CI verde, bug em prod | Smoke não cobre o caminho | Teste manual + smoke específico |
| Ranking sumiu | Deploy sobrescreveu `data/` | Excludes + backup + nunca clean-slate da pasta data |

---

## 14. Princípios que valem a pena guardar

1. **Dados dos jogadores são sagrados** — o código é descartável; o JSON do ranking não.
2. **Deploy automático + verificação HTTP** — verde no Actions não basta.
3. **Um caminho de input** — humano, touch e bot usam a mesma porta.
4. **Repo apresentável** — raiz limpa, secrets fora, `main` como padrão.
5. **Documente o “porquê”** — o próximo você (ou outro time) vai esquecer o sync FTP e o splash escondido.

---

## 15. Como reutilizar este playbook

1. Copie este arquivo para `docs/` do novo projeto (ou para um gist/repo de templates).
2. Troque só os exemplos de paths se quiser — a estrutura mental permanece.
3. Na primeira semana do projeto novo, marque no checklist o que já aplica (CI, FTP, cache, data/).
4. Depois de cada incidente de produção, acrescente uma linha na seção **Armadilhas**.

---

*Origem: aprendizados práticos ao construir e operar um jogo de sobrevivência 3D no navegador (Three.js), com GitHub Actions, Pages, FTP em hospedagem compartilhada, co-op WebRTC e demo automática — generalizado para qualquer projeto web parecido.*
