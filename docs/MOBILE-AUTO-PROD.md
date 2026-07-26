# Mobile / Cloud Agent → production

Edits made from the Cursor app on the phone (Cloud Agent) reach production without a manual merge.

## Pipeline

1. Agent opens a PR from a `cursor/*` branch (often against `main`, the default branch).
2. Workflow **Auto-merge Cursor PRs** (must exist on the PR **base** branch — especially `main`):
   - Retargets to `develop` if needed
   - Marks draft PRs ready
   - Waits for CI
   - Squash-merges into `develop`
   - Dispatches the existing deploy workflows
3. Production updates:
   - **HostGator** → https://jhonatanribeiro.com/snow/  ← primary production
   - **GitHub Pages** → https://dreadpiratejhonatan.github.io/snow/

## Important: workflow on `main`

GitHub only runs `pull_request` workflows that exist on the **base** branch of the PR.
Phone agents default to opening PRs against `main`. If `.github/workflows/auto-merge-cursor.yml`
is missing from `main`, auto-merge never starts, HostGator never deploys, and a manual
merge into `main` only updates Pages.

Keep this file on **both** `main` and `develop`.

## One-time GitHub Pages fix (phone or desktop)

After the default branch rename (`master` → `main`), the `github-pages` environment still only allows deployments from `master`, so Pages deploys fail instantly.

In the repo on GitHub:

1. **Settings** → **Environments** → **github-pages**
2. Under **Deployment branches**, add **`main`** and **`develop`** (or allow all)
3. Optionally remove the old **`master`** rule

Then re-run **Deploy GitHub Pages** (Actions → Run workflow), or make any phone change so auto-merge dispatches it again.

HostGator production does **not** need this step — it already deploys from `develop` after each auto-merge.

## Notes

- Only branches named `cursor/…` are auto-merged.
- Do **not** manually merge phone PRs into `main` — let auto-merge retarget to `develop`.
- If CI fails, the PR stays open for fix-ups.
- HostGator deploy never overwrites live `data/leaderboard.json` / tickets.
- Desktop pushes to `develop` still deploy via the normal push triggers.
