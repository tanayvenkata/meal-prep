import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { kitchenFixture, LOCAL_APP_DATABASE } from "./fixture";
import { startKitchenTelemetry } from "../../src/lib/telemetry";

async function main() {
  process.env.DATABASE_URL = LOCAL_APP_DATABASE;
  const telemetry = startKitchenTelemetry();
  const kitchen = await kitchenFixture();
  try {
    const added = await kitchen.call("add_pantry_item", { name: "Mayo" });
    assert.notEqual(added.isError, true);
    const rejected = await kitchen.call("set_pantry_item_quantity", { name: "Missing", quantity: { amount: "1", unit: "jar" } });
    assert.equal((rejected.structuredContent as { status?: string })?.status, "not_found");
    const invalid = await kitchen.call("add_pantry_item", { name: "Rice", quantity: { amount: "bad", unit: "count" } });
    assert.equal(invalid.isError, true);
    assert.equal((await kitchen.state()).pantry.length, 1);
    mkdirSync(".eval-results/kitchen", { recursive: true });
    writeFileSync(".eval-results/kitchen/telemetry-smoke.json", JSON.stringify({ calls: kitchen.calls, final: await kitchen.state() }, null, 2));
    console.log("Telemetry smoke passed: applied, rejected, and tool-error traces recorded.");
  } finally { await kitchen.close(); await telemetry.shutdown(); }
}
main().then(() => process.exit(0)).catch(() => { console.error("Telemetry smoke failed; check local database and collector setup."); process.exit(1); });
