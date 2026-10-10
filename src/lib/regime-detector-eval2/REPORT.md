# Regime detector evaluation v2 — paused before outcome analysis

**Status:** Step 0 and the frozen Part 1 protocol are committed and pushed. Part 2 found the holdout archive's 51 CSV members are all zero-byte placeholders, so the required 2004–2019 data is unavailable (**HOLDOUT MISSING / UNUSABLE**). The available 2020–2026 file has the expected SHA-256, but no market labels or forward outcomes were computed: review found a dimensional error in the frozen C3 formula. Because Part 1 expressly cannot be changed after hashing, outcome analysis is paused pending an authorized corrected pre-registration.

## 1. Step 0, hashes and provenance

- Step 0 frozen-source commit: `ee6a893c3fbcfc8a4673c968191013304868a544`; pushed to `arena/3a2c49d5-system`. After rebase, all seven file hashes and the detector tree hash matched the prior report; push verification matched local HEAD.
- Detector directory SHA-256: `05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1`.
- Default resolved-options SHA-256: `7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe`.
- All seven frozen file hashes are recorded in [STEP0-HASHES.md](./STEP0-HASHES.md).
- The fetched refs showed no earlier detector/guide history on `origin/main` or another remote branch; the only detector path history is the newly-added snapshot on the session branch. Threshold-tuning history is therefore **UNKNOWN**. No evidence of gold-data tuning or a tuning period is available. For the frozen default windows, thresholds and source lines, see the earlier [Part 0 provenance inventory](../regime-detector-eval/PROVENANCE.md).
- The detector is bar-based and has no fixed calendar-timeframe assumption; the holdout's 30-minute timeframe could not be verified because its payloads are empty.

## 2. Part 1 — pre-registration

- Frozen specification: [SPEC-RD2.md](./SPEC-RD2.md).
- SHA-256: `6997697e9372a4469d4893e5b39cd9af5cb3cff1ab94a34f91e27955d7457898`; verification: `SPEC-RD2.md: OK`.
- Part 1 commit: `faccb8e9697ff21b16e87cd10c31195144aeded3`; pushed and verified with `git ls-remote`.
- The declared claims are C1 high-volatility, C2 range, and C3 bullish-minus-bearish trend. Compression and transition are DESCRIPTIVE-ONLY. The 2020–2026 cohort is exploratory only and cannot support a verdict.

## 3. Part 2 — holdout inventory

The source was `origin/main` at `b57ccd7e5c62b1290b65e87cfa6d271e307a06de`. Its root `holdout.zip` SHA-256 is `116ecabc201360ad47903d9b741d9e10b267a5c78a76d6c1ee9e0be3789f7e40`. The archive contains 51 `.csv` members: 16 annual shards for each of XAUUSD, EURUSD and XAGUSD, plus three consolidated instrument files. **Every member is 0 bytes** and has the empty-file SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. No README is present.

The per-file inventory is in [HOLDOUT-INVENTORY.md](./HOLDOUT-INVENTORY.md). All files have zero rows, no columns and no first/last timestamps; duplicate, gap, geometry and timezone checks cannot be performed. The archive paths were extracted to `data/holdout/` as requested, without adding those data files to the commit.

The gold 2020–2026 CSV was copied from `origin/main`; its SHA-256 is `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`, matching the required hash.

## 4. Part 3 — outcome status

**No outcome table, claim verdict, or detector truncation test is reported.** The holdout is missing. Although the frozen fallback permits an exploratory 2020–2026 analysis, the C3 formula in SPEC-RD2 defines SATR as `(close[t+H]/close[t]-1)/ATR14[t]` while defining ATR14 as a price-unit true-range average. That quotient has units of inverse price, not ATR units, and does not implement the declared signed-return-in-ATR claim. Computing it and presenting it as ATR would be misleading. The SPEC remains unchanged and no market labels or outcomes were computed while this is unresolved.

The earlier 2020–2026 evaluation remains EXPLORATORY as directed and was not used to support a verdict. No 2004–2019 or secondary-instrument verdict is possible from empty files.

## 5. QA, scope and worktree

- The [SHA256SUMS.txt](./SHA256SUMS.txt) inventory contains 19 standard file entries and verifies; it intentionally does not hash itself. The 51 empty holdout payload hashes are listed individually in [HOLDOUT-INVENTORY.md](./HOLDOUT-INVENTORY.md).
- `npm ci` succeeded; npm reported 3 advisories (2 high, 1 critical).
- `npx tsc --noEmit` passed.
- After restoring the user's pre-existing local changes, `npm test` passed: 246 passed, 0 failed. Focused evaluation tests passed: 7 passed, 0 failed. A clean-tree run while those user changes were temporarily stashed had one UI assertion failure; no source was changed to address it. These suites were software QA only and their outputs were not used as market-statistical data.
- No external market data or non-npm network source was used. The detector, app, generator and existing tests were not edited.
- Existing unrelated modifications to `src/pages/Backtest.tsx`, `src/pages/MapGenerator.tsx` and `tests/run.mjs` remain uncommitted and unstaged.
- See [QUESTIONS.md](./QUESTIONS.md) for the C3 protocol issue and the requested decision. The SHA-256 inventory is [SHA256SUMS.txt](./SHA256SUMS.txt).
