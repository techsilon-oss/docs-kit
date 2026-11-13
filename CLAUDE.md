# docs-kit — agent instructions

## Start here
1. Read the [techsilon-oss kit standard](https://github.com/techsilon-oss/.github/blob/main/KIT-STANDARD.md) before you add or change a skill, a manifest, a doc or a release step. docs-kit follows it: skill names start with `docs-kit-`, `allowed-tools` pre-approves only the plugin's own scripts, and docs follow its Documentation rules.
2. Read `docs/DESIGN.md`. It is the brief: the layout rule, the components, the hazards and the rollout.
3. Read `git log --oneline -20` and the open issues (`gh issue list`).
4. Work the rollout in order (DESIGN §10). Open questions (DESIGN §11) need the owner's answer before the work that depends on them.

## Rules
- **No client or project names anywhere** in this repo or its issues and PRs: docs, code, comments, examples, test fixtures. Techsilon LLC owns this kit. Describe problems generically and use invented names (`example-app`). Before posting an issue or PR, search the draft for project names, repo paths and issue numbers from other repos. GitHub keeps edit history, so a draft that names a client is deleted and opened again, not edited.
- Scripts use Node built-ins only (`.mjs`), no runtime dependencies.
- Every hazard guard (DESIGN §7) has a test that reproduces the hazard.
- Conventional commits (`type(scope): description`), signed off (`git commit -s`, the DCO). Run the tests before every commit.
- Work on a branch; open a PR into `dev`; release `dev` to `main` by PR. `main` and `dev` are protected. Every merge needs the owner's explicit approval. Never push directly to `main` or `dev`.
- Docs follow the docs-kit layout (`npm test` checks `docs/`), and ASD-STE100: one action per step, plain words, no filler.
