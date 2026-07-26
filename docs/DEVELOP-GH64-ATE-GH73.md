# Develop — de gh64 até gh73 (jul 2026)

Resumo narrativo de tudo que foi feito nesta fase de desenvolvimento, continuando
[`DEVELOP-ATE-GH63.md`](DEVELOP-ATE-GH63.md). Cada seção corresponde a um bloco de
trabalho, na ordem em que aconteceu.

---

## 1. Reorganização do repositório

O repositório estava com arquivos soltos na raiz, o que passava uma impressão pouco
profissional no GitHub.

**O que foi feito:**
- Artes do splash movidas para `assets/splash/`
- Guias `DEPLOY-SEGURO`, `GITHUB-PAGES` e `RELEASE-NOTES` movidos para `docs/`
- Todas as referências internas (HTML, JS, workflows) atualizadas para os novos caminhos

**Lição:** ao mover arquivos, buscar todas as referências antes do commit — HTML,
imports JS, GitHub Actions e documentação cruzada.

## 2. Branch padrão: `master` → `main`

A branch padrão foi renomeada de `master` para `main`, seguindo a convenção atual do
GitHub. Foi necessário:
- Renomear local e remotamente
- Atualizar a branch padrão nas configurações do repositório
- Conferir workflows que referenciavam `master`

**Nota:** o GitHub Pages ficou configurado para fazer deploy apenas da `main` — por
isso pushes na `develop` mostram o job do Pages como falho, o que é **esperado** e
não indica problema no código.

## 3. Auditoria de segurança

Varredura completa nos repositórios online procurando senhas, usuários admin,
secrets e keys expostos.

**Resultado:** nenhuma credencial hardcoded no código. As credenciais de FTP do
HostGator ficam apenas em **GitHub Actions Secrets**. A senha do FTP foi trocada
por precaução e atualizada somente no cofre de secrets.

**Regra de ouro:** credencial nunca entra em código ou histórico do Git. Sempre
secrets do CI ou variáveis de ambiente.

## 4. Deploy HostGator via FTP (CI/CD)

Fluxo validado do zero: os arquivos em produção (`SEU-DOMINIO.com/snow`) foram
apagados manualmente e o workflow de deploy recriou tudo sozinho.

**Problema encontrado:** o action de FTP mantém um arquivo de estado
(`.ftp-deploy-sync-state.json`) no servidor. Depois de deletar arquivos manualmente,
o estado ficou obsoleto e o deploy "achava" que os arquivos ainda existiam.

**Correção:** apagar o `.ftp-deploy-sync-state.json` via FTP força uma
ressincronização completa no próximo deploy.

## 5. Bug: pernas atravessando o telhado da cabana

O jogador conseguia subir no telhado da cabana e as pernas atravessavam a geometria.

**Correção:** implementada a função `colliderTopAt`, que calcula a altura do topo do
colisor naquele ponto, tratando o telhado como superfície pisável em vez de deixar o
jogador afundar nele.

## 6. Demo automática (player não jogável)

Criado o `DemoBot` (`src/js/demoBot.js`): um jogador automático que joga o jogo
inteiro sozinho para o usuário assistir, testando e demonstrando as funcionalidades.

**Arquitetura:**
- Máquina de estados (FSM): explorar, coletar, lutar, voltar para a base, etc.
- Ativado por `?demo=1` na URL ou pelo menu
- Navegação "humana": desvio de obstáculos, pulo, strafe, tour da base, combate com
  órbita ao redor do inimigo

**Bug encontrado:** com `?demo=1` o jogo iniciava por baixo do splash HTML, que
ficava visível para sempre. Corrigido com `dismissSplash()` + um script inline no
`index.html` que esconde o splash via CSS antes mesmo do bundle carregar.

## 7. Playbook genérico

Todas as lições da criação do jogo foram consolidadas em
[`PLAYBOOK-JOGO-WEB.md`](PLAYBOOK-JOGO-WEB.md) — um guia genérico e reutilizável
para qualquer projeto parecido (jogo web 3D com deploy automatizado): cache busting,
CI, smoke tests, FTP, colisões, FSM para bots, etc.

## 8. Dungeon secreta (gh71)

A maior feature da fase: uma dungeon **secreta**, sem endereço definido no mapa.

**Design:**
- Entrada é uma caverna escondida, posicionada por **seed** (cada mundo tem a sua,
  sem marcador no minimapa)
- A arena fica num "bolso" fora dos limites do mapa (`POCKET_X/Z`, fora de ±bounds)
- Desafios em sequência (FSM): 2 ondas de inimigos → parkour de plataformas → chefe
  **Guardião do Abismo** → tesouro
- Recompensa: arma exclusiva **Relíquia do Abismo** (cristal roxo brilhante,
  55 de dano) + conquista **"Segredo do Abismo"**
- Solo only (co-op não entra); morrer dentro reseta a dungeon
- Estado `dungeonCleared` persiste no save

**Integrações técnicas:**
- `world.js`: `dungeonZone`, `inDungeonZone()`, override de `groundHeight()` e
  `isOnIce()`, `spawnEnemyAt()` para spawn preciso
- `enemies.js`: inimigos com flag `dungeon` ignoram o clamp de bounds do mapa
  (as paredes da arena seguram)
- `player.js`: `clampToBounds` desligado com `dungeonActive`
- `main.js`: iluminação/névoa fixa e escura dentro da dungeon, interação de entrada,
  morte dentro da dungeon chama `dungeon.leave(..., { died: true })`
- Smoke tests cobrindo entrada, física do bolso e configs do chefe/relíquia

**Conflito de cache:** outra frente de trabalho (áudio mobile) usou `gh70` ao mesmo
tempo. Resolvido combinando os dois changelogs e subindo tudo como `gh71`.

## 9. Melhorias de pickups + balanceamento de munição (gh72)

### Visual dos itens

- **Caixa (crate):** dobradiças e fecho metálicos, marcação "X" na tampa
- **Munição:** trava/fecho frontal, shells com emissive mais forte (0.6),
  PointLight amarela fraca
- **Armadilha:** antena com sensor no topo, PointLight vermelha sutil
- **Troféu:** 6 spikes dourados ao redor do pedestal, PointLight dourada,
  partículas douradas orbitando
- **Lanterna:** PointLight laranja dentro do vidro
- **Armas no chão:** PointLight na cor da arma, corda de arco/besta com glow
  azulado, metal mais realista (metalness 0.65 / roughness 0.35), partículas sutis

### Sistema de partículas

Nova função `_addLootParticles(group, color, count)`: 3-5 pontos aditivos
(size 0.04, opacity 0.6) orbitando o item com movimento circular + bobbing,
animados no `updateItems`. Aplicado só em **armas e troféus** para não pesar.

### Balanceamento de drops de munição (~40-50% de redução)

| Inimigo | Antes | Depois |
|---------|-------|--------|
| Lobo | flechas 3 @ 40% | 1-2 @ 25% |
| Raposa-da-neve | flechas 2 @ 55% | 1 @ 30% |
| Lobisomem | balas 8 @ 65% | 4-5 @ 40% |
| Mula | cartuchos 3 @ 70% | 2 @ 45% |
| Slender | granada 1 @ 55% | 1 @ 35% |
| Chuck | balas 5 @ 55%, flechas 3 @ 35% | 2-3 @ 35%, 1-2 @ 20% |
| Panda | cartuchos 4 @ 70% | 2 @ 45% |
| Saci | balas 12 @ 70% | 4-5 @ 45% |
| T-Rex | balas 18 @ 75% | 6-7 @ 50% |
| Boto | cartuchos 5 @ 75%, flechas 6 @ 70% | 3 @ 50%, 3-4 @ 45% |

Drops de **armas** e **armadilhas** ficaram inalterados (já eram balanceados).

**Suporte técnico:** `rollEnemyDrops` agora aceita `amount: [min, max]` e sorteia
a quantidade no intervalo: `Math.floor(min + Math.random() * (max - min + 1))`.

## 10. Correção da lança de gelo (gh73)

**Bug reportado:** a lança de gelo ficava sobreposta (atravessando) o corpo do
personagem, tanto parada quanto no ataque.

**Causa:** o mesh da lança era construído na vertical (haste de 1.4 subindo pelo
eixo Y), então ao ser montada no `weaponMount` do braço ela cruzava o torso.

**Correção em `weaponVisuals.js`:**
- Haste e ponta rotacionadas ~72° (`Math.PI / 2.5`) para posição quase horizontal
- Reposicionadas à frente do corpo
- Orientação específica para a lança no mount: `rotation(-0.35, 0.05, 0.05)` e
  `position(-0.05, 0, 0.2)` — as demais armas mantêm a orientação padrão

## Lições da fase (resumo rápido)

1. **Cache busting é obrigatório** — todo deploy incrementa `?v=ghXX` em CSS/JS
   (`index.html` + `scripts/build.mjs` + `CHANGELOG.md`)
2. **Sempre rodar os smoke tests antes de subir** (`node tests/smoke-test.mjs`)
3. **Produção serve bundle** — validar deploy buscando strings novas dentro de
   `src/js/bundle.js?v=ghXX`, não os módulos individuais (que dão 404)
4. **Trabalho paralelo na develop gera conflito de CHANGELOG/cache** — resolver
   combinando as entradas e subindo uma versão nova
5. **GitHub Pages falhar na develop é esperado** (só faz deploy da `main`)
6. **FTP sync state** pode ficar obsoleto após mexida manual no servidor
7. **Features "fora do mapa"** (como a dungeon) exigem revisar todo clamp de
   bounds: player, inimigos, knockback e groundHeight

## Estado atual

- Branch de trabalho: `develop` (cache **gh73**)
- Produção HostGator: atualizada via GitHub Actions (FTP)
- Todos os smoke tests passando
- Documentação: `CHANGELOG.md`, `RELEASE-NOTES.md` e este resumo em dia
