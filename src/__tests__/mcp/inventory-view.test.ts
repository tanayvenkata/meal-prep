// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createInventoryView } from "@/mcp/inventory-ui/view";
const template = readFileSync("src/mcp/inventory-ui/template.html", "utf8");
const snapshot = (readAt = "2026-09-07T12:00:00Z", pantry: unknown[] = []) => ({ structuredContent: { pantry, tools: [] }, _meta: { "mise/readAt": readAt } });
beforeEach(() => { document.documentElement.innerHTML = template; });
const root = () => document.querySelector("main")!;
const button = () => document.querySelector<HTMLButtonElement>("#refresh")!;
describe("saved inventory display", () => {
  it("preserves structured, descriptive, unknown and legacy quantities without inferring cartons", () => {
    const view = createInventoryView(root(), vi.fn());
    const base = { id: 1, name: "Eggs", turnover: "high", quantityAmount: null, quantityUnit: null };
    view.receive(snapshot(undefined, [
      { ...base, quantityMode: "structured", quantity: "2 count", quantityAmount: "2", quantityUnit: "count" },
      { ...base, id: 2, name: "Milk", quantityMode: "text", quantity: "half a carton" },
      { ...base, id: 3, name: "Salt", quantityMode: "unknown", quantity: "" },
      { ...base, id: 4, name: '<img src=x onerror="alert(1)">', quantityMode: "unsupported", quantity: "a pinch" },
    ]));
    expect(root().textContent).toContain("2 count");
    expect(root().textContent).not.toContain("24");
    expect(root().textContent).toContain("half a carton");
    expect(root().textContent).toContain("Amount not recorded");
    expect(root().textContent).toContain("a pinch");
    expect(root().querySelector("img")).toBeNull();
    expect(root().textContent).toContain("No equipment saved");
  });
  it("retains and labels the previous read after a refresh failure, then recovers", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(snapshot("2026-09-07T13:00:00Z"));
    const view = createInventoryView(root(), refresh); view.receive(snapshot()); view.ready();
    button().click();
    expect(button().disabled).toBe(true);
    await vi.waitFor(() => expect(button().disabled).toBe(false));
    expect(root().textContent).toContain("may be out of date");
    expect(root().textContent).toContain("No pantry items saved");
    button().click();
    await vi.waitFor(() => expect(button().disabled).toBe(false));
    expect(root().textContent).not.toContain("may be out of date");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("does not render malformed data as saved or overwrite a newer read", () => {
    const view = createInventoryView(root(), vi.fn());
    view.receive({ structuredContent: { pantry: [] } });
    expect(root().textContent).toContain("Could not read");
    expect(root().textContent).not.toContain("No pantry items saved");
    view.receive(snapshot("2026-09-07T13:00:00Z"));
    const newer = document.querySelector("#read-time")!.textContent;
    view.receive(snapshot("2026-09-07T12:00:00Z"));
    expect(document.querySelector("#read-time")!.textContent).toBe(newer);
    view.receive({ isError: true, ...snapshot("2026-09-07T14:00:00Z") });
    expect(root().textContent).toContain("may be out of date");
  });
});
