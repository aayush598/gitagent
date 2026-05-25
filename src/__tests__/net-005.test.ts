import { test } from "node:test";
import { strictEqual, ok } from "node:assert";

test("fetchWithTimeout rejects on timeout", async () => {
  const { fetchWithTimeout } = await import("../fetch.ts");

  const result = await fetchWithTimeout("http://localhost:19999", { timeout: 50 }).then(
    () => "resolved",
    () => "rejected",
  );
  strictEqual(result, "rejected");
});

test("fetchWithTimeout resolves on success", async () => {
  const { fetchWithTimeout } = await import("../fetch.ts");

  const server = await import("http");
  const s = server.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as any).port;

  try {
    const res = await fetchWithTimeout(`http://127.0.0.1:${port}`, { timeout: 5000 });
    ok(res.ok);
  } finally {
    s.close();
  }
});
