/**
 * Display-only projection of the bundled donor profile. The Map Generator can
 * render defaults and calibration context without eagerly loading the large
 * synthesis engine/profile payload; generation imports that engine on demand.
 * Keep these values synchronized with DEFAULT_PROFILE (pinned by synth tests).
 */
export const DEFAULT_PROFILE_SUMMARY = {
  sample: {
    calendar: {
      representativeStartDate: "2021-01-18",
      standardWeekBarCount: 230,
    },
    price: {
      median: 1957.24,
      minimum: 1451.43,
      maximum: 5597.23,
    },
    atrPercent: {
      quantiles: {
        p10: 0.0011584658759518454,
        p90: 0.003084724083829661,
      },
    },
    rolling60DayDriftLogReturn: {
      quantiles: {
        p10: -0.05516403323571824,
        p90: 0.1094870194467006,
      },
    },
  },
  source: {
    span: {
      start: "2020-01-24 05:00:00",
      end: "2026-10-01 15:00:00",
    },
    canonicalCandlesSha256: "a3b9f2d0bdfa3e578f94189256d191e1b0c45445c25ce206891bb24a471f3229",
  },
} as const;
