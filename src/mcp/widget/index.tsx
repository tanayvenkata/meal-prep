import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createKitchenWidgetApp } from "./bridge";
import { KitchenContextWidget } from "./components/KitchenContextWidget";
import {
  isKitchenContext,
  type KitchenContext,
} from "./types";

type OpenAiGlobalsEvent = CustomEvent<{
  globals?: { theme?: unknown; toolOutput?: unknown };
}>;

type OpenAiWindow = Window & {
  openai?: { theme?: unknown; toolOutput?: unknown };
};

const kitchenListeners = new Set<(value: unknown) => void>();

function publishKitchen(value: unknown) {
  for (const listener of kitchenListeners) listener(value);
}

function applyTheme(value: unknown) {
  if (value === "light" || value === "dark") applyDocumentTheme(value);
}

function applyHostContext(context: McpUiHostContext) {
  applyTheme(context.theme);
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }
}

const app = createKitchenWidgetApp({
  onToolResult: publishKitchen,
  onHostContextChanged: applyHostContext,
});
let appConnection: Promise<void> | undefined;

window.addEventListener(
  "openai:set_globals",
  (event) => {
    const globalsEvent = event as OpenAiGlobalsEvent;
    applyTheme(
      globalsEvent.detail?.globals?.theme ??
        (window as OpenAiWindow).openai?.theme,
    );
    publishKitchen(
      globalsEvent.detail?.globals?.toolOutput ??
        (window as OpenAiWindow).openai?.toolOutput,
    );
  },
  { passive: true },
);

async function initializeBridge() {
  appConnection ??= app.connect().then(() => {
    const hostContext = app.getHostContext();
    if (hostContext) applyHostContext(hostContext);
  });
  await appConnection;
}

function MiseKitchenApp() {
  const [kitchen, setKitchen] = useState<KitchenContext | null>(() => {
    const initialOutput = (window as OpenAiWindow).openai?.toolOutput;
    return isKitchenContext(initialOutput) ? initialOutput : null;
  });
  const [bridgeFailed, setBridgeFailed] = useState(false);

  useEffect(() => {
    const receiveKitchen = (value: unknown) => {
      if (isKitchenContext(value)) setKitchen(value);
    };

    kitchenListeners.add(receiveKitchen);
    void initializeBridge().catch((error) => {
      console.error("Mise widget bridge initialization failed:", error);
      setBridgeFailed(true);
    });

    return () => {
      kitchenListeners.delete(receiveKitchen);
    };
  }, []);

  return (
    <KitchenContextWidget
      bridgeFailed={bridgeFailed}
      kitchen={kitchen}
    />
  );
}

const rootElement = document.querySelector("#root");
if (!rootElement) throw new Error("Kitchen widget is missing #root.");

applyTheme((window as OpenAiWindow).openai?.theme);

createRoot(rootElement).render(
  <StrictMode>
    <MiseKitchenApp />
  </StrictMode>,
);
