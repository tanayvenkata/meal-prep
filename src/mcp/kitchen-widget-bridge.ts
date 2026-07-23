import {
  App,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

type KitchenWidgetBridgeOptions = {
  onHostContextChanged: (context: McpUiHostContext) => void;
  onToolResult: (structuredContent: unknown) => void;
  autoResize?: boolean;
};

export function createKitchenWidgetApp({
  onHostContextChanged,
  onToolResult,
  autoResize = true,
}: KitchenWidgetBridgeOptions) {
  const app = new App(
    { name: "mise-kitchen-widget", version: "0.3.0" },
    {},
    { autoResize },
  );

  app.ontoolresult = (result) => onToolResult(result.structuredContent);
  app.onhostcontextchanged = onHostContextChanged;

  return app;
}
