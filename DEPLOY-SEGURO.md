# Deploy seguro — Neve Selvagem

Com jogadores no ranking / tickets, **nunca apague** `data/leaderboard.json` nem `data/tickets.json` no servidor.

Cache do cliente atual: **`?v=gh62`**.

Pacote local: `release/snow.zip` (ou pasta `release/hostgator-snow/`).  
Preparar de novo: `npm run build` ou `powershell -File scripts/prepare-hostgator-deploy.ps1`.

Site típico: `https://jhonatanribeiro.com/snow/`

## Método recomendado (PRESERVA RANKING + TICKETS)

### Via cPanel File Manager

1. Entre em `public_html/snow/`
2. **Backup:** baixe `data/leaderboard.json` e `data/tickets.json` (se existir) para o PC  
   (guarde em `release/deploy-backup/` se quiser)
3. **Deixe a pasta** `data/` **intacta**
4. Apague apenas: `index.html`, `src/`, `api/`, `music/`, `faces/`, `tickets/`, `splash_screen.*`, `sc1.jpeg`…`sc4.jpeg`
5. Extraia o `snow.zip` novo ali (Upload → Extract)
6. Se o zip trouxe `data/` sem `leaderboard.json` / `tickets.json`, está correto — o PHP cria se faltar
7. Se por engano sobrescreveu o JSON, restaure o backup do passo 2
8. Permissões da pasta `data/`: **755** ou **775**
9. Permissões de `data/rooms/`: **755** ou **775** (co-op)
10. **Tickets admin:** crie `data/tickets-admin.key` com **uma linha** = senha secreta (não versionar). Sem isso, mudar status falha de propósito.
11. Abra o site e force **Ctrl+F5** (cache `?v=gh62`)
12. Teste ranking: zerar → digitar nome → Enviar → tecla **T**
13. Co-op: criar sala 2–4 jogadores. Guia: `docs/COOP.md`
14. Tickets: abra `/snow/tickets/` → envie um bug de teste → na seção Moderar, use a senha do `.key`

### Pacote pronto após `npm run build`

- Pasta: `release/hostgator-snow/`
- Zip: `release/snow.zip`
- **Não** sobe `data/leaderboard.json` / `tickets.json` do zip (só `*.example.json`)
- Inclui `api/signal.php` (co-op até 4), `api/tickets.php`, pasta `tickets/`, `music/` com manifest

### Via FTP (FileZilla, WinSCP)

1. Conecte e vá em `public_html/snow/`
2. Baixe `data/leaderboard.json` (e `tickets.json`) — backup
3. Apague o resto **exceto** `data/`
4. Suba o conteúdo de `release/hostgator-snow/`
5. Confirme que `data/leaderboard.json` no servidor ainda é o do backup
6. Ctrl+F5 no navegador

## O que o build faz

- `release/hostgator-snow/data/` **não leva** ranking/tickets vivos (só examples)
- Assim o upload do zip não clobber ranking/tickets em produção
- Dev local (`dist/`) pode ter seed vazio se ainda não existir arquivo
- Senha de tickets: `data/tickets-admin.key` só no servidor (fora do git)

## Se você perdeu o ranking (recuperação)

1. **Cache dos jogadores:** `localStorage.getItem('neveLeaderboardCache')` no F12 — merge parcial
2. **Backup** que você baixou antes do deploy (`release/deploy-backup/`)
3. **PC de dev:** `web-cs/data/leaderboard.json` se rodou testes com scores

## Checklist

- [ ] Backup de `data/leaderboard.json` (e `tickets.json`) antes de cada deploy
- [ ] Nunca apagar a pasta `data/` inteira
- [ ] Permissões `755`/`775` em `data/` e `data/rooms/`
- [ ] `api/signal.php` novo no ar (co-op 4P)
- [ ] Top 10 aparece após o deploy (tecla **T**)
- [ ] Ctrl+F5 — script com `?v=gh62` no código-fonte

## Estrutura do ranking

```json
{
  "entries": [
    {
      "name": "Jogador",
      "timeMs": 120000,
      "at": "2026-07-21T03:00:00Z"
    }
  ]
}
```

Top 50 no servidor, ordenado por `timeMs` (menor = melhor).

## TURN (opcional)

Depois do deploy estável: `docs/TURN-VPS.md` — injete `window.NEVE_TURN` no `index.html` **do servidor**, não no Git.
