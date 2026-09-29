/* Bridge endpoint auth: Bearer token policy for /api/mt5/bridge. */
import { test, assert, assertEqual } from "./tiny.mjs";
import { mt5Engine } from "../src/lib/mt5/engine.ts";
import {
  expectedBridgeToken,
  unauthorizedBridgeResponse,
  verifyBridgeToken,
} from "../src/lib/mt5/bridge-auth.ts";

test("bridge-auth: the current engine token is accepted", () => {
  mt5Engine.setCredentials({ apiToken: "sfp-test-token-abc" });
  assert(verifyBridgeToken(`Bearer ${expectedBridgeToken()}`), "exact current token accepted");
  assert(verifyBridgeToken("Bearer sfp-test-token-abc"), "literal token accepted");
  assert(
    verifyBridgeToken("  bearer   sfp-test-token-abc  "),
    "scheme is case-insensitive and whitespace is tolerated",
  );
});

test("bridge-auth: wrong, missing, and malformed headers are rejected", () => {
  mt5Engine.setCredentials({ apiToken: "sfp-test-token-abc" });
  assert(!verifyBridgeToken("Bearer wrong-token"), "wrong token rejected");
  assert(!verifyBridgeToken(null), "missing header rejected");
  assert(!verifyBridgeToken(undefined), "undefined header rejected");
  assert(!verifyBridgeToken(""), "empty header rejected");
  assert(!verifyBridgeToken("sfp-test-token-abc"), "bare token without Bearer scheme rejected");
  assert(!verifyBridgeToken("Basic sfp-test-token-abc"), "non-Bearer scheme rejected");
  assert(!verifyBridgeToken("Bearer "), "empty bearer payload rejected");
});

test("bridge-auth: rotating the token invalidates the old one", () => {
  mt5Engine.setCredentials({ apiToken: "old-token-1" });
  assert(verifyBridgeToken("Bearer old-token-1"), "token valid before rotation");
  mt5Engine.setCredentials({ apiToken: "new-token-2" });
  assert(!verifyBridgeToken("Bearer old-token-1"), "old token rejected after rotation");
  assert(verifyBridgeToken("Bearer new-token-2"), "new token accepted after rotation");
});

test("bridge-auth: empty engine token falls back to sfp-default-token", () => {
  mt5Engine.setCredentials({ apiToken: "" });
  assertEqual(expectedBridgeToken(), "sfp-default-token", "fallback token used");
  assert(verifyBridgeToken("Bearer sfp-default-token"), "default token accepted");
  assert(!verifyBridgeToken("Bearer "), "empty token still rejected");
});

test("bridge-auth: 401 response tells the user to re-download the EA", async () => {
  const response = unauthorizedBridgeResponse();
  assertEqual(response.status, 401, "status is 401");
  const body = await response.json();
  assertEqual(body.status, "error", "error envelope");
  assert(
    String(body.message).toLowerCase().includes("re-download"),
    "message explains the fix: re-download the EA",
  );
});
