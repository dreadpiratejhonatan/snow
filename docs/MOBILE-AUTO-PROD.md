# Mobile / Cloud Agent → production

Edits made from the Cursor app on the phone (Cloud Agent) reach production without a manual merge.

## Pipeline

1. Agent opens a PR from a `cursor/*` branch.
2. Workflow **Auto-merge Cursor PRs**:
   - Retargets to `develop` if needed
   - Marks draft PRs ready
   - Waits for CI
   - Squash-merges into `develop`
   - Dispatches the existing deploy workflows
3. Production updates:
   - **HostGator** → https://jhonatanribeiro.com/snow/
   - **GitHub Pages** → https://dreadpiratejhonatan.github.io/snow/

## Notes

- Only branches named `cursor/…` are auto-merged.
- If CI fails, the PR stays open for fix-ups.
- HostGator deploy never overwrites live `data/leaderboard.json` / tickets.
- Desktop pushes to `develop` still deploy via the normal push triggers.
