export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKitchenTelemetry } = await import("./lib/telemetry");
    startKitchenTelemetry();
  }
}
