import { getMcpAuthConfig } from "./auth";
import { createMiseHttpServer } from "./server";

const PORT = 8787;

async function main() {
  createMiseHttpServer().listen(PORT, () => {
    console.log(`Mise MCP server: ${getMcpAuthConfig().resource.href}`);
  });
}

void main();
