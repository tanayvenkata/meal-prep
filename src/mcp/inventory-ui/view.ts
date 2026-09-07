import { kitchenContextSchema, type KitchenSnapshot } from "./contract";

export function quantityLabel(item: KitchenSnapshot["pantry"][number]): string {
  if (item.quantityMode === "unknown") return "Amount not recorded";
  if (item.quantityMode === "structured" && item.quantityAmount && item.quantityUnit) {
    return `${item.quantityAmount} ${item.quantityUnit}`;
  }
  return item.quantity.trim() || "Amount not recorded";
}

export function createInventoryView(root: HTMLElement, refresh: () => Promise<unknown>) {
  const status = root.querySelector<HTMLElement>("#status")!;
  const content = root.querySelector<HTMLElement>("#inventory")!;
  const button = root.querySelector<HTMLButtonElement>("#refresh")!;
  const timestamp = root.querySelector<HTMLElement>("#read-time")!;
  let hasSnapshot = false;
  let latestReadAt = "";

  function fail() {
    status.textContent = hasSnapshot
      ? "Could not refresh. The previous read remains below; it may be out of date. Reconnect Mise if needed, then retry."
      : "Could not read saved inventory. Reconnect Mise if needed, then retry.";
  }

  function receive(value: unknown) {
    const result = value as { isError?: boolean; structuredContent?: unknown; _meta?: Record<string, unknown> } | undefined;
    const parsed = kitchenContextSchema.safeParse(result?.structuredContent);
    const readAt = result?._meta?.["mise/readAt"];
    if (result?.isError || !parsed.success || typeof readAt !== "string" || !Number.isFinite(Date.parse(readAt))) {
      fail();
      return;
    }
    // A late initial notification must not replace a newer completed refresh.
    if (latestReadAt && Date.parse(readAt) < Date.parse(latestReadAt)) return;
    latestReadAt = readAt;
    content.replaceChildren();
    function section(title: string, rows: { name: string; detail: string }[], empty: string) {
      const heading = document.createElement("h2");
      heading.textContent = `${title} (${rows.length})`;
      content.append(heading);
      if (!rows.length) {
        const p = document.createElement("p"); p.textContent = empty; content.append(p); return;
      }
      const list = document.createElement("ul");
      for (const row of rows) {
        const li = document.createElement("li");
        const name = document.createElement("span"); name.textContent = row.name;
        const detail = document.createElement("span"); detail.className = "detail"; detail.textContent = row.detail;
        li.append(name, detail); list.append(li);
      }
      content.append(list);
    }
    section("Pantry", parsed.data.pantry.map(item => ({ name: item.name, detail: quantityLabel(item) })), "No pantry items saved.");
    section("Equipment", parsed.data.tools.map(item => ({ name: item.name, detail: item.kind })), "No equipment saved.");
    timestamp.textContent = `Read at ${new Date(readAt).toLocaleString()}. Refresh to check for changes.`;
    hasSnapshot = true;
    status.textContent = "Saved quantities shown as recorded; package sizes are not inferred.";
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Reading saved inventory…";
    root.setAttribute("aria-busy", "true");
    try { receive(await refresh()); } catch { fail(); }
    finally { button.disabled = false; root.setAttribute("aria-busy", "false"); }
  });
  return { receive, fail, ready: () => { button.disabled = false; } };
}
