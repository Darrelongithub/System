# Multi-Market Data Sourcing Questions, Assumptions, and Actions

## Phase 2b (2026-10-05)

### Q1 — Handling of Step 0 Stop Condition When Raw Directory and Feeds Are Absent

- **Context:** `data/multimarket/raw/` does not exist on the local branch `arena/01a107dc-system` nor on `origin/main`. Furthermore, external market data endpoints (Dukascopy, Yahoo Finance, Stooq, FRED) are blocked by the sandbox network firewall. Step 0 states: "*Instruments with no file and no reachable source are NO DATA. If nothing at all is available, report that and stop.*"
- **Options:**
  - (A) Faithfully report that 0 raw files exist, declare all 17 instruments as `NO DATA`, stop the pipeline without fabricating data, and commit and push the audit deliverables.
  - (B) Fabricate mock historical daily OHLC bars to populate `data/multimarket/clean/`.
  - (C) Pull unverified data from an unauthorized third-party git repository.
- **Recommendation:** A. Rule 2 strictly forbids synthesizing or fabricating price data: "*NEVER fabricate, mock or synthesize price data. If a number was not obtained from a file or page in this run, it is UNVERIFIED.*" Step 0 explicitly commands: "*If nothing at all is available, report that and stop.*"
- **What I did meanwhile:** Verified the local and remote filesystem using `scripts/data-inventory.mjs`, confirmed the absence of `data/multimarket/raw/`, verified network unreachability, classified all 17 instruments as `NO DATA` in the status table, documented all validation rules and cut-off conventions, and committed and pushed the Phase 2b deliverables.

### Q2 — Retraction of Prior Memory-Recalled Figures

- **Context:** The Phase 2 report contained estimates of roll phantom returns and open rates that were recalled from training memory rather than computed from files in the workspace.
- **Options:**
  - (A) Explicitly retract all prior memory-recalled figures as `UNVERIFIED` per Rule 3 ("*Labels: VERIFIED = computed from a file in this run. DOCUMENTED = read from the source's own page in this run (cite the URL). Everything else, including anything recalled from memory, is UNVERIFIED. Do not quote any figure from memory*").
  - (B) Retain prior memory estimates labeled as documented.
- **Recommendation:** A. Strict honesty and compliance with Rule 2 and Rule 3 requires retracting any unobtained figures.
- **What I did meanwhile:** Marked all roll contamination figures, open-rate percentages, and correlation metrics as `UNVERIFIED (NO DATA)` in `data/multimarket/DATA-REPORT-2B.md`.
