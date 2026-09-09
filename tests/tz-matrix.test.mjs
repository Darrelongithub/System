/**
 * Host-timezone independence.
 *
 * V8 reads TZ once at process start, so the only way to exercise a different
 * host timezone is a child process. This test re-runs the timezone-sensitive
 * suite (status-parse-time-tz) under several TZ values and requires every one
 * to pass. It is what would have caught the pre-v1.7 parseTime bug on a
 * developer machine in Nairobi (where the buggy code happened to be correct).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, assert } from "./tiny.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TZS = ["UTC", "America/New_York", "Asia/Tokyo", "Africa/Nairobi"];

const RUNNER = `
import { runAll } from "./tests/tiny.mjs";
await import("./tests/status-parse-time-tz.test.mjs");
process.exit((await runAll()) ? 0 : 1);
`;

test("tz-matrix: parseTime suite passes under UTC, New York, Tokyo and Nairobi hosts", () => {
  const failures = [];
  for (const tz of TZS) {
    const res = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--import", "./tests/register.mjs", "--input-type=module", "-e", RUNNER],
      {
        cwd: path.resolve(here, ".."),
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
      },
    );
    if (res.status !== 0) failures.push(`TZ=${tz}\n${res.stdout}${res.stderr}`);
  }
  assert(failures.length === 0, `timezone-dependent behaviour detected:\n${failures.join("\n")}`);
});
