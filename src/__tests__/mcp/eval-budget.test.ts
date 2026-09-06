import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvaluationBudget } from "../../../evals/kitchen/budget";

let directories: string[] = [];
let budgets: EvaluationBudget[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), "mise-budget-")); directories.push(path); return path; };
const open = (path: string) => { const budget = new EvaluationBudget(path); budgets.push(budget); return budget; };
afterEach(() => { for (const budget of budgets) budget.close(); for (const path of directories) rmSync(path, { recursive: true, force: true }); budgets = []; directories = []; });

describe("evaluation spend boundary without any model calls", () => {
  it("persists a larger model reservation and settles within that bound", () => {
    const path = directory();
    const budget = open(path);
    const request = budget.reserve(0.6);
    expect(JSON.parse(readFileSync(join(path, "budget.json"), "utf8")).chargedUsd).toBe(0.6);
    expect(() => request.settle(0.61)).toThrow("invalid_usage_estimate");
    request.settle(0.4);
    expect(budget.chargedUsd).toBe(0.4);
  });
  it.each([0, -1, NaN, Infinity, 6])("rejects invalid reservations %s before changing the ledger", amount => {
    const budget = open(directory());
    expect(() => budget.reserve(amount)).toThrow("invalid_reservation");
    expect(budget.chargedUsd).toBe(0);
  });
  it("persists a reservation before dispatch and retains it after an uncertain failure", () => {
    const path = directory();
    const budget = open(path);
    budget.reserve();
    expect(JSON.parse(readFileSync(join(path, "budget.json"), "utf8")).chargedUsd).toBe(0.32);
    budget.close();
    expect(open(path).chargedUsd).toBe(0.32);
  });
  it("retains cumulative spending across runs and refuses the next oversized reservation", () => {
    const path = directory();
    writeFileSync(join(path, "budget.json"), JSON.stringify({ capUsd: 5, chargedUsd: 4.7 }));
    const budget = open(path);
    expect(() => budget.reserve()).toThrow("budget_exhausted");
    expect(budget.chargedUsd).toBe(4.7);
  });
  it("settles known usage once and cannot refund a reservation twice", () => {
    const budget = open(directory());
    const request = budget.reserve();
    request.settle(0.0061234);
    expect(budget.chargedUsd).toBe(0.006124);
    expect(() => request.settle(0)).toThrow("invalid_budget_settlement");
  });
  it.each([NaN, Infinity, -1, 0.5])("keeps the reservation for invalid usage %s", amount => {
    const budget = open(directory());
    const request = budget.reserve();
    expect(() => request.settle(amount)).toThrow("invalid_usage_estimate");
    expect(budget.chargedUsd).toBe(0.32);
  });
  it("blocks concurrent writers without deleting the live lock", () => {
    const path = directory();
    open(path);
    expect(() => new EvaluationBudget(path)).toThrow();
    expect(() => new EvaluationBudget(path)).toThrow();
  });
  it.each(["broken json", '{"capUsd":50,"chargedUsd":0}', '{"capUsd":5,"chargedUsd":-1}'])("fails closed on a corrupt or changed ledger", contents => {
    const path = directory();
    writeFileSync(join(path, "budget.json"), contents);
    expect(() => new EvaluationBudget(path)).toThrow();
    expect(readFileSync(join(path, "budget.json"), "utf8")).toBe(contents);
  });
});
