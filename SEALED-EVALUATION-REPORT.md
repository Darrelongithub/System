# INDEPENDENT SEALED EVALUATION REPORT (PATH A)

## Objective
Following the failure of intraday and microstructure strategies, we explored "Path A: Higher-timeframe strategy discovery."
The goal was to formulate hypotheses strictly using permitted development data (2004-2007, 2009-2011, 2013-2015, 2017-2018), freeze the specifications, and then independently evaluate them against the **Sealed Years** (2008, 2012, 2016, 2019). No parameters were adjusted after evaluating the sealed data.

## Hypotheses Formulated
1. **XAU-DONCHIAN-20D:** A daily breakout strategy (20-day high/low) with a trailing ATR stop, attempting to capture multi-day trend persistence.
2. **XAU-TAIL-REVERSION-15D:** A daily mean-reversion strategy triggered by an extreme single-day crash (< -1.5%), attempting to capture post-crash drift and macro-event overreactions over a 15-day hold.

*See `HIGHER-TF-STRATEGY-SPEC-FROZEN.md` for exact frozen specifications.*

## Sealed Data Results
The strategies were run exclusively on the sealed years (2008, 2012, 2016, 2019) with strict conservative execution costs (100 ticks spread at daily rollover + standard swap rates).

### 1. XAU-DONCHIAN-20D
- **Trades in Sealed Data:** 45
- **Win Rate:** 33.33%
- **Mean Net R:** +0.0064 R
- **Verdict:** FAILS to reject the null hypothesis. Performance degrades to breakeven noise on unseen data.

### 2. XAU-TAIL-REVERSION-15D
- **Trades in Sealed Data:** 84
- **Win Rate:** 41.67%
- **Mean Net R:** -0.1073 R
- **Verdict:** FAILS to reject the null hypothesis. Demonstrates negative expectancy on unseen data, proving that post-crash drift is highly dependent on the specific macroeconomic regimes present in the development data.

## Conclusion
Both higher-timeframe hypotheses completely collapsed when subjected to truly independent, unseen sealed data. This is a textbook example of selection bias during hypothesis formulation: what appeared to be a mild statistical edge in the development years was merely a curve-fit to the prevailing regimes of those specific years.

We have successfully executed an honest attempt to disprove the market behaviors, and we successfully disproved them. 
