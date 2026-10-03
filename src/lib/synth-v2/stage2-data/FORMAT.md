Status: Stage 1b G2 passed

# Stage 2 path artifact format

Each `stage2-data/{design,locked-test,null}/seed-NNNN.json.gz` is a gzip-compressed UTF-8 JSON record using `synth-v2-stage2-delta-json-v1`. One file is one deterministic seeded path. The payload stores exact minute-delta timestamps, OHLC-cent deltas, per-bar label bit fields, fixed-point dial deltas at scale 1e9, the segment plan, and the Stage 1b G2 status tag.

Use `decodeStage2Artifact` from `src/lib/synth-v2/stage2-artifacts.ts` to expand a record into candles, per-bar labels, and engine-parser-compatible CSV. `DESIGN-seed-1-engine.csv` is the parser round-trip sample. Per-seed canonical JSON and compressed-file SHA-256 values are in the set checksum files.

The `locked-test` directory is embargoed until a detector is frozen. The runner generates, deterministically re-generates for byte comparison, compresses, and hashes those paths; it does not compute or print their statistical properties.
