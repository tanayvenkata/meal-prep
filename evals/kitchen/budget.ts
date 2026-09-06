import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const EVALUATION_CAP_USD = 5;
export const REQUEST_RESERVATION_USD = 0.32;
const micros = (usd: number) => Math.ceil(usd * 1_000_000);

/** Persistent fail-closed reservation ledger. One process owns it at a time. */
export class EvaluationBudget {
  private chargedMicros = 0;
  private lock: number;
  private ledgerPath: string;
  private lockPath: string;
  private closed = false;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.ledgerPath = join(directory, "budget.json");
    this.lockPath = join(directory, "run.lock");
    this.lock = openSync(this.lockPath, "wx");
    try {
      writeFileSync(this.lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      if (existsSync(this.ledgerPath)) {
        const prior = JSON.parse(readFileSync(this.ledgerPath, "utf8"));
        if (prior.capUsd !== EVALUATION_CAP_USD || !Number.isFinite(prior.chargedUsd) || prior.chargedUsd < 0) throw new Error("invalid_budget_ledger");
        this.chargedMicros = micros(prior.chargedUsd);
      }
    } catch (error) { this.close(); throw error; }
  }

  get chargedUsd() { return this.chargedMicros / 1_000_000; }
  private save(next: number) {
    const temporary = `${this.ledgerPath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ capUsd: EVALUATION_CAP_USD, chargedUsd: next / 1_000_000, updatedAt: new Date().toISOString() }, null, 2));
    renameSync(temporary, this.ledgerPath);
    this.chargedMicros = next;
  }

  reserve(amountUsd = REQUEST_RESERVATION_USD) {
    if (this.closed) throw new Error("budget_closed");
    if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > EVALUATION_CAP_USD) throw new Error("invalid_reservation");
    const reserved = micros(amountUsd);
    if (this.chargedMicros + reserved > micros(EVALUATION_CAP_USD)) throw new Error("budget_exhausted");
    this.save(this.chargedMicros + reserved); // Persist before dispatch.
    let settled = false;
    return {
      settle: (estimatedUsd: number) => {
        if (settled || this.closed) throw new Error("invalid_budget_settlement");
        if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0 || estimatedUsd > amountUsd) throw new Error("invalid_usage_estimate");
        this.save(this.chargedMicros + micros(estimatedUsd) - reserved);
        settled = true;
      },
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    closeSync(this.lock);
    unlinkSync(this.lockPath);
  }
}
