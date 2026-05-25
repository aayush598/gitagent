import { test } from "node:test";
import { strictEqual, ok } from "node:assert";

test("configureHttpClient sets global dispatcher", async () => {
  const undici = await import("undici");
  const original = undici.getGlobalDispatcher();

  const { configureHttpClient } = await import("../http-client.ts");
  configureHttpClient();

  const updated = undici.getGlobalDispatcher();
  ok(updated !== original, "global dispatcher should be replaced");
  strictEqual(typeof updated, "object");
});
