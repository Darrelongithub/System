/** Server-only runtime persistence. The default output directory is gitignored. */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  chmodSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { mt5Engine, type MT5RuntimeSnapshot } from "./engine";

let initialized = false;
export function initializeRuntimeState() {
  if (initialized) return;
  initialized = true;
  if (
    process.env["MT5_STATE_DISABLED"] === "1" ||
    process.env["NODE_ENV"] === "test" ||
    process.argv.some((a) => /(?:^|\/)tests\//.test(a)) ||
    process.execArgv.includes("--test")
  )
    return;
  const path = resolve(process.env["MT5_RUNTIME_STATE_PATH"] || "output/mt5-runtime-state.json");
  let last = "";
  try {
    try {
      const data = readFileSync(path, "utf8");
      mt5Engine.restoreRuntimeState(JSON.parse(data) as MT5RuntimeSnapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    mt5Engine.setPersistence((snapshot) => {
      const data = JSON.stringify(snapshot);
      if (data === last) return;
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, data, { mode: 0o600 });
      chmodSync(temp, 0o600);
      const fd = openSync(temp, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, path);
      const dirFd = openSync(dirname(path), "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
      last = data;
    });
    // Verify writable storage before accepting commands.
    mt5Engine.setConfig({});
  } catch (error) {
    console.error("[MT5] Failed to restore runtime state; automation disabled", error);
    mt5Engine.failPersistence(error);
  }
  if (mt5Engine.getConfig().enabled && !process.env["MT5_ADMIN_TOKEN"])
    console.warn("[MT5] WARNING: auto-trading enabled without MT5_ADMIN_TOKEN");
}
