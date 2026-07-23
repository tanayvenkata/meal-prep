import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import {
  legacy as resolveLegacyPackageEntry,
  resolve as resolvePackageExport,
} from "resolve.exports";

export type KitchenWidgetResource = {
  html: string;
  uri: string;
};

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageManifests = new Map<string, Record<string, unknown>>();

function resolveLocalWidgetPackage(specifier: string) {
  if (specifier.startsWith("@/")) return null;

  const parts = specifier.split("/");
  const packageName = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  const packageRoot = resolve(projectRoot, "node_modules", packageName);
  let packageManifest = packageManifests.get(packageName);
  if (!packageManifest) {
    packageManifest = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    packageManifests.set(packageName, packageManifest);
  }

  const [exportPath] =
    resolvePackageExport(packageManifest, specifier, {
      browser: true,
      conditions: ["production"],
    }) ?? [];
  const legacyPath =
    exportPath ??
    resolveLegacyPackageEntry(packageManifest, {
      fields: ["browser", "module", "main"],
    }) ??
    "index.js";
  if (typeof legacyPath !== "string") {
    throw new Error(`Could not resolve widget package import: ${specifier}`);
  }

  return resolve(packageRoot, legacyPath);
}

export async function buildKitchenWidgetResource(): Promise<KitchenWidgetResource> {
  const template = readFileSync(
    new URL("./widget/index.html", import.meta.url),
    "utf8",
  );
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("./widget/index.tsx", import.meta.url)),
    ],
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    format: "iife",
    minify: true,
    platform: "browser",
    target: "es2022",
    outdir: "widget-build",
    write: false,
    plugins: [
      {
        name: "resolve-widget-packages",
        setup(buildContext) {
          // A Yarn PnP manifest exists above this repository and would
          // otherwise override this project's node_modules resolution. Resolve
          // this project's export maps with browser/import conditions so the
          // widget receives SDK ESM entry points instead of CommonJS fallbacks.
          buildContext.onResolve({ filter: /^[^./]/ }, (args) => {
            const path = resolveLocalWidgetPackage(args.path);
            return path ? { path } : null;
          });
        },
      },
    ],
  });
  const script = bundle.outputFiles.find(
    (file) => file.path.endsWith(".js"),
  )?.text;
  const componentStyles =
    bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  if (!script) throw new Error("Kitchen widget bundle was not generated.");

  const cssUrl = new URL("./widget/styles.css", import.meta.url);
  const styles = await postcss([tailwindcss()])
    .process(readFileSync(cssUrl, "utf8"), {
      from: fileURLToPath(cssUrl),
    })
    .then((result) => result.css);
  const htmlWithStyles = template.replace(
    "<!-- KITCHEN_WIDGET_STYLE -->",
    `${styles}\n${componentStyles}`.replaceAll("</style", "<\\/style"),
  );
  const html = htmlWithStyles.replace(
    "<!-- KITCHEN_WIDGET_SCRIPT -->",
    () => `<script>${script.replaceAll("</script", "<\\/script")}</script>`,
  );
  const contentHash = createHash("sha256")
    .update(html)
    .digest("hex")
    .slice(0, 12);

  return {
    html,
    uri: `ui://widget/kitchen-context-${contentHash}.html`,
  };
}
