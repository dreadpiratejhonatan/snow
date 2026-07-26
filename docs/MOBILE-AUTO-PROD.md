# Mobile / Cloud Agent → production

Edits made from the Cursor app on the phone (Cloud Agent) should reach production without a manual merge.

## Pipeline

1. Agent opens a PR from a `cursor/*` branch.
2. Workflow **Auto-merge Cursor PRs** retargets the PR to `develop` (if needed), marks it ready, waits for CI, then squash-merges.
3. The same workflow deploys (because merges with the default GitHub token do not start other Actions):
   - **HostGator** → https://jhonatanribeiro.com/snow/
   - **GitHub Pages** → https://dreadpiratejhonatan.github.io/snow/

Desktop pushes to `develop` still use the normal **Deploy HostGator** / **Deploy GitHub Pages** workflows.

## First-time setup

Open/merge the PR that adds `.github/workflows/auto-merge-cursor.yml` into `develop` once. If that PR’s head already contains the workflow, it can merge and deploy itself when CI is green. After that, later phone/`cursor/*` PRs go to production alone.

## Notes

- Only branches named `cursor/…` are auto-merged.
- If CI fails, the PR stays open for fix-ups.
- HostGator deploy never overwrites live `data/leaderboard.json` / tickets.
