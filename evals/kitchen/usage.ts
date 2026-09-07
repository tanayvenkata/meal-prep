/** Per-run reporting only: no spending cap, reservations, lock, or persistent ledger. */
export class RunUsage {
  knownCostUsd = 0;
  unknownCostRequests = 0;
  requests = 0;

  startRequest() {
    this.requests++;
    this.unknownCostRequests++;
    let recorded = false;
    return (costUsd: number) => {
      if (recorded || !Number.isFinite(costUsd) || costUsd < 0) throw new Error("invalid_usage_cost");
      this.knownCostUsd += costUsd;
      this.unknownCostRequests--;
      recorded = true;
    };
  }
}
