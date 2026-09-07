import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
const iframe = document.querySelector<HTMLIFrameElement>("iframe")!;
const state = document.querySelector("#bridge-status")!;
async function call(name: string) {
  const response = await fetch("/mcp", { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer synthetic-fixture",
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
  const body = await response.json();
  if (body.error) throw new Error("Fixture call failed");
  return body.result;
}
const bridge = new AppBridge(null, { name: "Mise local fixture host", version: "1" }, { serverTools: {} }, { hostContext: { theme: "light", displayMode: "inline" } });
bridge.oncalltool = async ({ name }) => {
  if (name !== "read_kitchen") throw new Error("Only read_kitchen is allowed");
  return call(name);
};
bridge.oninitialized = async () => {
  state.textContent = "Official MCP Apps handshake completed (local fixture host).";
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult(await call("show_kitchen"));
};
bridge.onsizechange = ({ height }) => { iframe.style.height = `${height}px`; };
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  button.onclick = async () => { await fetch(`/scenario?mode=${button.dataset.mode}`, { method: "POST" }); state.textContent = `Fixture mode: ${button.dataset.mode}. Press Refresh in the card.`; };
}
document.querySelector<HTMLButtonElement>("#theme")!.onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  bridge.setHostContext({ theme: dark ? "dark" : "light", displayMode: "inline" });
};
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
iframe.src = "/widget";
