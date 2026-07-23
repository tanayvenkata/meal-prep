import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import {
  Cabinet,
  CheckCircle,
} from "@openai/apps-sdk-ui/components/Icon";
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createKitchenWidgetApp } from "@/mcp/kitchen-widget-bridge";

type KitchenContext = {
  pantry: Array<{ name: string; quantity: string; turnover: "high" | "low" }>;
  tools: Array<{ name: string; kind: string }>;
};

type OpenAiGlobalsEvent = CustomEvent<{
  globals?: { theme?: unknown; toolOutput?: unknown };
}>;

type OpenAiWindow = Window & {
  openai?: { theme?: unknown; toolOutput?: unknown };
};

const kitchenListeners = new Set<(value: unknown) => void>();

function isKitchenContext(value: unknown): value is KitchenContext {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<KitchenContext>;
  return Array.isArray(candidate.pantry) && Array.isArray(candidate.tools);
}

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

function KitchenWidget() {
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

  if (!kitchen) {
    return (
      <main className="p-4" aria-live="polite">
        <p className="text-sm text-secondary" role={bridgeFailed ? "alert" : "status"}>
          {bridgeFailed
            ? "Kitchen context could not be displayed."
            : "Loading kitchen context…"}
        </p>
      </main>
    );
  }

  return (
    <main className="p-4">
      <article className="w-full">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-secondary">Mise kitchen</p>
            <h1 className="mt-1 heading-lg">Your current kitchen</h1>
          </div>
          <Badge color="success" pill>
            <CheckCircle className="size-3.5" aria-hidden="true" />
            Live
          </Badge>
        </header>

        <section className="mt-5" aria-labelledby="pantry-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pantry-heading" className="font-medium">
              Pantry
            </h2>
            <span className="text-sm text-secondary">
              {kitchen.pantry.length} items
            </span>
          </div>
          {kitchen.pantry.length === 0 ? (
            <p className="mt-2 rounded-xl border border-subtle px-3 py-4 text-sm text-secondary">
              No pantry items saved yet.
            </p>
          ) : (
            <dl className="mt-2 divide-y divide-subtle rounded-xl border border-subtle">
              {kitchen.pantry.map((item) => (
                <div
                  className="flex items-center justify-between gap-4 px-3 py-2.5"
                  key={`${item.name}-${item.quantity}`}
                >
                  <dt className="font-medium capitalize">{item.name}</dt>
                  <dd className="text-sm text-secondary">{item.quantity}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="mt-4 border-t border-subtle pt-4" aria-labelledby="tools-heading">
          <div className="flex items-center gap-2 text-secondary">
            <Cabinet className="size-4" aria-hidden="true" />
            <h2 id="tools-heading" className="text-sm font-medium">
              Kitchen tools
            </h2>
          </div>
          {kitchen.tools.length === 0 ? (
            <p className="mt-2 text-sm text-secondary">
              No kitchen tools saved yet.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {kitchen.tools.map((tool) => (
                <li key={`${tool.name}-${tool.kind}`}>
                  <Badge variant="soft" color="secondary" pill>
                    {tool.name}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  );
}

const rootElement = document.querySelector("#root");
if (!rootElement) throw new Error("Kitchen widget is missing #root.");

applyTheme((window as OpenAiWindow).openai?.theme);

createRoot(rootElement).render(
  <StrictMode>
    <KitchenWidget />
  </StrictMode>,
);
