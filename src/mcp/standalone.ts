import { getMcpAuthConfig } from "./auth";
import { createMiseHttpServer } from "./server";
import { startKitchenTelemetry } from "../lib/telemetry";

const PORT = 8787;

async function main() {
  const telemetry = startKitchenTelemetry();
  const server = createMiseHttpServer().listen(PORT, () => {
    console.log(`Mise MCP server: ${getMcpAuthConfig().resource.href}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
    server.close(() => { void telemetry.shutdown().then(() => process.exit(0)); });
  });
}

void main();
