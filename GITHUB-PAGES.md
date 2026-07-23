# Publicar Neve Selvagem no GitHub Pages

O jogo fica jogável em `https://SEU_USER.github.io/SEU_REPO/`.

**Importante:** GitHub Pages é só arquivos estáticos. O ranking PHP (`api/leaderboard.php`) **não roda** aqui — os tempos ficam no `localStorage` do navegador. Ranking compartilhado continua na HostGator.

## 1. Criar o repositório no GitHub

1. Em [github.com/new](https://github.com/new), crie um repo (ex.: `neve-selvagem`), público.
2. Não marque “Add README” se for enviar esta pasta já pronta.

## 2. Enviar o código (PowerShell)

Na pasta `web-cs` (com [Git](https://git-scm.com/download/win) instalado):

```powershell
cd c:\dev\cursor\web-cs
git init
git add .
git commit -m "Neve Selvagem — pronto para GitHub Pages"
git branch -M main
git remote add origin https://github.com/SEU_USER/neve-selvagem.git
git push -u origin main
```

Troque `SEU_USER` e `neve-selvagem` pelos seus.

Com GitHub CLI (`gh auth login` antes):

```powershell
gh repo create neve-selvagem --public --source=. --remote=origin --push
```

## 3. Ativar Pages

1. Repo → **Settings** → **Pages**
2. **Source:** GitHub Actions
3. Abra a aba **Actions**, rode o workflow **Deploy GitHub Pages** (ou espere o push)
4. Quando ficar verde, o link aparece em Settings → Pages

URL típica: `https://SEU_USER.github.io/neve-selvagem/`

## 4. Testar local (igual ao Pages)

```powershell
npm run build
npm run preview
```

Abra http://127.0.0.1:5180/

## Checklist

- [ ] Repo criado e código enviado
- [ ] Pages = GitHub Actions
- [ ] Workflow verde
- [ ] Jogo abre no celular/desktop
- [ ] Ctrl+F5 se o cache antigo atrapalhar
