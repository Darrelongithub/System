# Questions / blocked inputs

These are logged for the final delivery; no clarification was requested mid-run.

## Q1 — Exact frozen task specification

- **Options:** (A) provide or restore the exact earlier task text/spec artifact; (B) permit a best-effort reconstruction from the current report, source, and session summary.
- **Recommendation:** A. The requested `SPEC.md` must be verbatim and the gate tolerances/design are frozen, so inference is unsafe.
- **What I did meanwhile:** the exact earlier task text is not available in this checkout/conversation context. Per instruction, Phase 0a was skipped; I did not create or hash a fabricated `SPEC.md`, and did not run any gate that depends on missing exact criteria.
- **How to change it:** restore the original text or frozen `SPEC.md`; copy it unchanged into `src/lib/synth/SPEC.md`, hash it, then append the separately preregistered repair protocol only where authorized.

## Q2 — Dayblock implementation and catalog absent from this checkout

- **Options:** (A) restore the prior dayblock patch/catalog/builder; (B) authorize rebuilding the dayblock system from the summary and archive.
- **Recommendation:** A, to preserve the frozen implementation and make the reported Phase 0 funnel reproducible. Rebuilding from incomplete criteria could silently change donor selection.
- **What I did meanwhile:** verified that this working tree has no `dayblock.ts`, `dayblock-types.ts`, `dayblock-catalog.ts`, dayblock builder, or dayblock tests. `src/lib/synth/generate.ts` still contains the old profile-based weekly generator. I verified the registered raw archive from `main` at `/tmp/XAUUSD_30min_2020-01-24_to_2026-10-01.csv`: SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`, 24,045,090 bytes. I did not make a speculative implementation change or rerun D1.
- **How to change it:** restore the exact dayblock source/catalog/builder/preregistration and tests into the current branch, or explicitly authorize reconstruction from scratch.

## Q3 — Missing D1–D7 and map gate definitions

- **Options:** (A) restore the complete exact D1–D7, sanity-check, and Phase 4 map specification; (B) infer the unspecified criteria from historical `REPORT.md` and the high-level task summary.
- **Recommendation:** A. The old report identifies the historical D1 interval formula and a prior Phase 4 outline, but does not define all D3–D7 checks, the 20-seed D1 bootstrap procedure, random-entry baseline, 2020–24 catalog-control calculation, or oracle-bound formula exactly.
- **What I did meanwhile:** preserved all available historical content as historical only. No D1 statistic, later gate, sanity check, or map result was invented or reported as run.
- **How to change it:** provide the original frozen criteria; place them verbatim in `src/lib/synth/SPEC.md`, hash before any rerun, and use them unchanged.

## Q4 — Backup directory conflicts with the allowed-path restriction

- **Options:** (A) put phase tarballs at repository-root `backups/`; (B) keep them under `src/lib/synth/backups/`.
- **Recommendation:** B, because the task also restricts touched paths to `src/lib/synth/`, `tests/`, and `scripts/synth-*` / `scripts/stress-*`.
- **What I did meanwhile:** chose `src/lib/synth/backups/` provisionally and excluded that directory from its own archive. The phase-0 archive cannot include the absent dayblock catalog.
- **How to change it:** if repository-root `backups/` is permitted as an explicit exception, move/copy the tarball there and update its recorded hash.
