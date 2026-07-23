import { buildKitchenWidgetResource } from "./build-widget";
import { getMcpAuthConfig } from "./auth";
import { createMiseHttpServer } from "./server";

const PORT = 8787;

async function main() {
  const kitchenWidgetResource = await buildKitchenWidgetResource();

  createMiseHttpServer({ kitchenWidgetResource }).listen(PORT, () => {
    console.log(`Mise MCP server: ${getMcpAuthConfig().resource.href}`);
  });
}

void main();
