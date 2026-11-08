# STAGE 5: FORWARD TEST PROTOCOL

*Note: No strategy passed the Stage 4 tests. However, the following protocol is established for any future strategy that meets the candidate requirements.*

## Paper-Trading Protocol
1. **Clean Data Boundary:** Only data generated *after* the strategy specification freeze timestamp (2026-11-08 17:15:00 UTC) counts as clean holdout data.
2. **Execution Logging:** The forward testing engine must independently log:
   - Signal generation time.
   - Intended limit/stop entry price.
   - Actual fill price (accounting for gap-throughs and slippage).
   - Bid/Ask spread at the exact millisecond of fill.
   - Exit price, exit time, and exit reason (e.g., Stop Loss, Time Limit).
   - The broker server time mapping against EET/EEST.
3. **Verdict Threshold:** A minimum of 100 executed trades must be logged before any statistical verdict can be drawn.
4. **Pass Criteria:** The forward-tested sample must independently pass the exact same bars established in Stage 2 (Net Mean > +0.10R, Day-clustered t > 2, etc.).
5. **Freeze Enforcement:** No rule, parameter, or filter may be modified, optimized, or debugged during the forward test window. If a bug is found, the forward test is invalidated entirely.
