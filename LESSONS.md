# Lessons — zcash-shielded-assets-and-memes

Project-specific. Cross-project patterns go in the workspace `LESSONS.md`.

## What broke

- **Never touch the $STAMP launch wallet.** `26oK69…` holds the launch supply and is off-limits for
  every operation, including tests. Use `mAQdwb…` instead. (2026-09-20)
- **A mock-wallet test builds transactions but never broadcasts.** Worth saying out loud when reporting
  results: "the launchpad handed the wallet a 0.5 SOL request" read as though something had been spent.
## Rejected
## Approved
