# Public application workspace

- This repository contains only the public application framework and fictional development inputs.
- Never copy private chart methods, user rules, original books, uploads, account/case records, databases, credentials, signing keys, or the original Git history here.
- Do not inspect or execute private materials in the upstream workspace. Use the public chart adapter and fictional tests.
- Preserve user changes in the upstream workspace. Export only a reviewed, committed Site revision with `maintenance/sync.mjs` and the explicit allowlist.
- Future authorized updates must include a public export review, applicable build/tests, a normal GitHub commit and `git push`, and verification that the remote commit matches. Website deployment remains a separate workflow.
- Newly added public files require allowlist review. Never replace the allowlist with a recursive copy or a mirror push. Do not use force push.
- The local development identity simulator must never be deployed to a public service.
