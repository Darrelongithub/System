import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { VerifyResult } from "./verifier.server";

const verifyInput = z.object({
  scoutData: z.string().min(1, "scoutData is required"),
  ohlcCsv: z.string().optional(),
});

export const verifySetup = createServerFn({ method: "POST" })
  // `.inputValidator()` is a deprecated alias for `.validator()` (identical type
  // and runtime behaviour — the installed start-client-core literally assigns
  // `inputValidator: setValidator`), but it logs a deprecation warning on every
  // SSR request that touches this module and will be removed in a future
  // TanStack Start release.
  .validator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data }) => {
    const { runVerification } = await import("./verifier.server");
    return runVerification(data);
  });
