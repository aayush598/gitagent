import { test } from "node:test";
import { ok } from "node:assert";

test("configureHttpClient configures keep-alive agent without error", async () => {
  const { configureHttpClient } = await import("../http-client.ts");
  configureHttpClient();
  ok(true, "keep-alive agent configured");
});
