import { describe, it } from "node:test";
import assert from "node:assert";
describe("COMP-001: SOC2 Gap", () => {
  it("isAuditEnabled defaults to true when compliance is undefined", async () => {
    const { isAuditEnabled } = await import("../src/audit.ts");
    assert.strictEqual(isAuditEnabled(undefined), true);
  });
  it("isAuditEnabled returns true when compliance has no recordkeeping", async () => {
    const { isAuditEnabled } = await import("../src/audit.ts");
    assert.strictEqual(isAuditEnabled({ risk_level: "low" }), true);
  });
  it("isAuditEnabled returns true when audit_logging is explicitly true", async () => {
    const { isAuditEnabled } = await import("../src/audit.ts");
    assert.strictEqual(isAuditEnabled({ recordkeeping: { audit_logging: true } }), true);
  });
  it("isAuditEnabled returns false when audit_logging is explicitly false", async () => {
    const { isAuditEnabled } = await import("../src/audit.ts");
    assert.strictEqual(isAuditEnabled({ recordkeeping: { audit_logging: false } }), false);
  });
  it("AuditLogger defaults to enabled when no flag passed", async () => {
    const { AuditLogger } = await import("../src/audit.ts");
    const logger = new AuditLogger("/tmp", "test-session");
    assert.strictEqual(logger.enabled, true);
  });
});
