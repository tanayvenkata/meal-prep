import { App, PostMessageTransport, applyDocumentTheme, applyHostStyleVariables, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { createInventoryView } from "./view";

const app = new App({ name: "Mise saved kitchen", version: "1.0.0" }, {});
let refreshTool: "read_kitchen" | "get_kitchen_context" | undefined;
const view = createInventoryView(document.querySelector("main")!, async () => {
  if (!refreshTool) throw new Error("No read tool available");
  return app.callServerTool({ name: refreshTool, arguments: {} }, { timeout: 15000 });
});
app.ontoolresult = result => {
  const name = result._meta?.["mise/refreshTool"];
  if (name === "read_kitchen" || name === "get_kitchen_context") refreshTool = name;
  view.receive(result);
  if (refreshTool) view.ready();
};
app.ontoolcancelled = () => view.fail();
function applyContext(context?: McpUiHostContext) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}
app.onhostcontextchanged = applyContext;
// The SDK owns handshake and validation; restrict messages to this iframe's host.
app.connect(new PostMessageTransport(window.parent, window.parent), { timeout: 15000 })
  .then(() => applyContext(app.getHostContext()))
  .catch(() => view.fail());
