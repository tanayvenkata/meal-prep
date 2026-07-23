import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import {
  Cabinet,
  CheckCircle,
} from "@openai/apps-sdk-ui/components/Icon";
import type { KitchenContext } from "../types";

type KitchenContextWidgetProps = {
  bridgeFailed: boolean;
  kitchen: KitchenContext | null;
};

export function KitchenContextWidget({
  bridgeFailed,
  kitchen,
}: KitchenContextWidgetProps) {
  if (!kitchen) {
    return (
      <main className="p-4" aria-live="polite">
        <p
          className="text-sm text-secondary"
          role={bridgeFailed ? "alert" : "status"}
        >
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

        <section
          className="mt-4 border-t border-subtle pt-4"
          aria-labelledby="tools-heading"
        >
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
