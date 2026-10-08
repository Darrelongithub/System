# Questions for the requester (logged; no pause in execution)

## 1. Should semantic label names count as forward claims?

- **Options:** (A) Strictly use claims explicitly stated in `docs/MARKET-REGIME-DETECTOR.md`; (B) infer high-volatility persistence, compression expansion, and trend continuation from the labels.
- **Recommendation:** A. The task says claimless labels are `DESCRIPTIVE-ONLY`; inferred claims would change the preregistered hypothesis after seeing the label definitions.
- **What I did meanwhile:** Frozen every label as `DESCRIPTIVE-ONLY`; Part 3 reports conditional forward statistics as diagnostics only, with no predictive pass/fail verdict.

## 2. How should rows marked `is_reliable=false` be handled?

- **Options:** (A) Use all finite, valid, chronologically ordered OHLC rows and ignore that derived annotation; (B) exclude unreliable rows before detection.
- **Recommendation:** A absent a user-specified raw-data exclusion rule. The detector consumes OHLC, the task specifies the complete SHA-pinned file, and row deletion would alter rolling history.
- **What I did meanwhile:** The frozen protocol uses every valid source OHLC row, does not filter on `is_reliable`, and fails closed rather than repairing or silently dropping invalid data.

## 3. What is the authoritative version history for the detector?

- **Options:** (A) Evaluate the exact current worktree source identified by hashes; (B) wait for a versioned detector/guide commit.
- **Recommendation:** B for future provenance, but A is the only way to complete the requested evaluation in this session without editing pre-existing files.
- **What I did meanwhile:** The detector and guide had no Git history and were untracked at the start. I froze an unchanged source snapshot and recorded that this limitation prevents establishing whether defaults were ever tuned against gold.

## 4. Can Part 4 access commit `f640c4d`?

- **Options:** (A) Provide/fetch the missing Git object and rerun the source comparison; (B) skip Part 4 and report it unverified.
- **Recommendation:** A if Part 4 is important; source identity is a prerequisite in the task. The commit object is not present locally, and the task forbids other network access.
- **What I did meanwhile:** Did not run the synthetic Part 4 cohort or modify the generator. Part 4 is marked `NOT RUN / UNVERIFIED`.
