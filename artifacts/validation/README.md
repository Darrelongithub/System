# Forward-validation ledger

`ledger.jsonl` is written by `scripts/research/validate-on-new-data.mjs` — one JSON line
per evaluation of the **shipped** rules on data outside the discovery window. It is
append-only by convention: never edit or delete a line, including a failing one.

A record carries the data hash, the window, the rule-source hashes, the git HEAD, the
per-month/per-side deltas, the pre-registered criteria and the verdict. Re-evaluating a
data hash that is already present is allowed but recorded with `"rerun": true` — visible on
purpose; see `FORWARD-VALIDATION.md` §4.

The ledger is currently **empty**: no shipped rule has been evaluated on out-of-sample
data yet.
