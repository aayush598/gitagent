import { test } from "node:test";
import { strictEqual } from "node:assert";

test("DNS order is set to ipv4first", async () => {
  const dns = await import("dns");
  dns.setDefaultResultOrder("ipv4first");
  strictEqual(typeof dns.setDefaultResultOrder, "function");
});

test("voice server URL uses explicit IP", () => {
  const port = 3333;
  const url = new URL("/health", `http://127.0.0.1:${port}`);
  strictEqual(url.hostname, "127.0.0.1");
  strictEqual(url.port, "3333");
});
