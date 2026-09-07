import { afterEach, expect, it, vi } from "vitest";
import { otlpOptions } from "@/lib/telemetry";

afterEach(() => vi.unstubAllEnvs());

it("does not enable an implicit localhost exporter when no endpoint is configured", () => {
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  expect(otlpOptions("TRACES")).toBeUndefined();
});

it("disables invalid collector URLs without throwing or logging their contents", () => {
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "invalid-SENSITIVE-collector");
  expect(otlpOptions("TRACES")).toBeUndefined();
});

it("enables a signal endpoint without a common endpoint", () => {
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  vi.stubEnv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "https://collector.example/custom");
  expect(otlpOptions("METRICS")?.url).toBe("https://collector.example/custom");
});
