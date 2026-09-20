# Lessons — zcash-shielded-assets-and-memes

Project-specific. Cross-project patterns go in the workspace `LESSONS.md`.

## What broke

- **Never launch from the $STAMP launch wallet, and never use its key.** `26oK69…` holds the launch
  supply. Nothing may be launched from it and its private key is never used, in tests or anywhere
  else. (2026-09-20)
- **It does receive fees, as of 2026-09-21.** The operator moved launch fees and the 2% creator fee
  to `26oK69…`. Receiving needs no key, so this does not weaken the rule above — but it means the
  ban in `src/core/forbidden.ts` covers signing only, not being paid. Superseded `mAQdwb…`, which
  discovery still reads so the coins launched under it stay listed. (2026-09-21)
- **A mock-wallet test builds transactions but never broadcasts.** Worth saying out loud when reporting
  results: "the launchpad handed the wallet a 0.5 SOL request" read as though something had been spent.
## Rejected
## Approved
