import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { VerifyResult } from "./verifier.server";

const verifyInput = z.object({
  scoutData: z.string().min(1, "scoutData is required"),
  ohlcCsv: z.string().optional(),
});

export const verifySetup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data }) => {
    const { runVerification } = await import("./verifier.server");
    return runVerification(data);
  });
