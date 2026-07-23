import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

export type KitchenWidgetResource = {
  html: string;
  uri: string;
};

export async function buildKitchenWidgetResource(): Promise<KitchenWidgetResource> {
  const template = readFileSync(
    new URL("./kitchen-widget.html", import.meta.url),
    "utf8",
  );
  const resolveWidgetImport = createRequire(
    new URL("./kitchen-widget.tsx", import.meta.url),
  );
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("./kitchen-widget.tsx", import.meta.url)),
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
          // otherwise override this project's node_modules resolution.
          buildContext.onResolve({ filter: /^[^./]/ }, (args) => ({
            path: resolveWidgetImport.resolve(args.path),
          }));
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

  const cssUrl = new URL("./kitchen-widget.css", import.meta.url);
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
