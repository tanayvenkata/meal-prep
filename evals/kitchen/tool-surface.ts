export type EvaluationToolSurface = "four" | "baseline";

/** Match the application default; historical comparisons must opt in. */
export function evaluationToolSurface(value = process.env.MISE_TOOL_SURFACE): EvaluationToolSurface {
  if (value === undefined || value === "four") return "four";
  if (value === "baseline") return "baseline";
  throw new Error("MISE_TOOL_SURFACE must be four or baseline.");
}
