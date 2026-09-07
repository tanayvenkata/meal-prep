import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { kitchenFixture, LOCAL_APP_DATABASE } from "./fixture";
import { startKitchenTelemetry } from "../../src/lib/telemetry";

async function main() {
  process.env.DATABASE_URL = LOCAL_APP_DATABASE;
  const telemetry = startKitchenTelemetry();
  // This historical contract smoke intentionally exercises the baseline tools.
  const kitchen = await kitchenFixture({ toolSurface: "baseline" });
  try {
    const initialized = await kitchen.inspect("initialize");
    const catalog = await kitchen.inspect("tools/list");
    assert.equal(catalog.tools.length, 12);
    const added = await kitchen.inspect("tools/call", "add_pantry_item", { name: "Rice", quantity: { mode: "text", text: "a little left" } });
    assert.equal(added.structuredContent.status, "created");
    const cleared = await kitchen.inspect("tools/call", "update_pantry_item", { id: added.structuredContent.item.id, expectedName: "Rice", quantity: { mode: "unknown" } });
    assert.equal(cleared.structuredContent.status, "updated");
    const final = await kitchen.state();
    assert.equal(final.pantry.length, 1);
    assert.equal(final.pantry[0].quantity, "");
    mkdirSync(".eval-results/kitchen", { recursive: true });
    writeFileSync(".eval-results/kitchen/inspector-smoke.json", JSON.stringify({ inspectorVersion: "2.5.0", initialized, toolCount: catalog.tools.length, added, cleared, final }, null, 2));
    console.log("Inspector smoke passed: initialize, catalog, descriptive add, and unknown update.");
  } finally { await kitchen.close(); await telemetry.shutdown(); }
}
main().then(() => process.exit(0)).catch(() => { console.error("Inspector smoke failed. Check local stack and Inspector installation; no credential was logged."); process.exit(1); });
