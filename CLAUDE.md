# docs-kit — agent instructions

## Start here
1. Read `docs/DESIGN.md`. It is the brief: the layout rule, the components, the hazards and the rollout.
2. Read `git log --oneline -20` and the open issues (`gh issue list`).
3. Work the rollout in order (DESIGN §10). Open questions (DESIGN §11) need the owner's answer before the work that depends on them.

## Rules
- **No client or project names anywhere** in this repo or its issues and PRs: docs, code, comments, examples, test fixtures. TechSilon LLC owns this kit. Describe problems generically and use invented names (`example-app`). Before posting an issue or PR, search the draft for project names, repo paths and issue numbers from other repos. GitHub keeps edit history, so a draft that names a client is deleted and opened again, not edited.
- Scripts use Node built-ins only (`.mjs`), no runtime dependencies.
- Every hazard guard (DESIGN §7) has a test that reproduces the hazard.
- Conventional commits (`type(scope): description`). Run the tests before every commit.
- Work on `dev`; release to `main` by PR. Every merge needs the owner's explicit approval. Never push directly to `main`.
