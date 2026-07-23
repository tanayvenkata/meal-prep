import { describe, expect, it } from "vitest";
import {
  adjustStructuredPantryQuantity,
  formatPantryQuantity,
  isPantryQuantityUnit,
  pantryQuantitiesEqual,
  pantryQuantityMatchesStoredFields,
  parsePantryQuantity,
  parsePantryQuantityInput,
  type StructuredPantryQuantity,
} from "@/lib/pantry-quantity";

function expectStructured(
  input: string,
  amount: string,
  unit: string,
): void {
  const result = parsePantryQuantity(input);
  expect(result).toEqual({
    ok: true,
    value: {
      mode: "structured",
      amount,
      unit,
      text: null,
    },
  });
}

describe("parsePantryQuantity", () => {
  it("treats a blank string as an unknown quantity", () => {
    expect(parsePantryQuantity(" \n ")).toEqual({
      ok: true,
      value: {
        mode: "unknown",
        amount: null,
        unit: null,
        text: null,
      },
    });
  });

  it("keeps bare numbers as text because no unit was supplied", () => {
    expect(parsePantryQuantity("0012.500000")).toMatchObject({
      ok: true,
      value: { mode: "text", text: "0012.500000" },
    });
    expectStructured("0 count", "0", "count");
  });

  it("normalizes only explicit conservative unit aliases", () => {
    expectStructured("2 pounds", "2", "lb");
    expectStructured("1 LITRE", "1", "l");
    expectStructured("3 packs", "3", "package");
    expectStructured("4 bunches", "4", "bunch");
  });

  it("converts exact terminating fractions into canonical decimals", () => {
    expectStructured("1/2 cup", "0.5", "cup");
    expectStructured("3/8 lbs", "0.375", "lb");
    expectStructured("1/1000000 kg", "0.000001", "kg");
    expectStructured("0/5 cans", "0", "can");
  });

  it.each([
    ["-1 cup", "negative"],
    ["1/-2 cup", "negative"],
    ["NaN cup", "non_finite"],
    ["Infinity", "non_finite"],
    ["1/0 cup", "zero_denominator"],
    ["1000000000", "amount_exceeded"],
    ["999999999.9999999", "scale_exceeded"],
  ])("rejects unsafe numeric input %s", (input, code) => {
    expect(parsePantryQuantity(input)).toMatchObject({ ok: false, code });
  });

  it("preserves valid fractions that cannot fit the structured scale", () => {
    expect(parsePantryQuantity("1/3 cup")).toMatchObject({
      ok: true,
      value: { mode: "text", text: "1/3 cup" },
    });
    expect(parsePantryQuantity("1/128 cup")).toMatchObject({
      ok: true,
      value: { mode: "text", text: "1/128 cup" },
    });
  });

  it("accepts the numeric(15,6) upper boundary", () => {
    expectStructured(
      "999999999.999999 count",
      "999999999.999999",
      "count",
    );
  });

  it("allows extra decimal zeroes when canonicalization is lossless", () => {
    expectStructured("1.23000000 kg", "1.23", "kg");
  });

  it("preserves unrecognized wording exactly apart from outer whitespace", () => {
    expect(parsePantryQuantity("  half  gallon  ")).toEqual({
      ok: true,
      value: {
        mode: "text",
        amount: null,
        unit: null,
        text: "half  gallon",
      },
    });
    expect(parsePantryQuantity("2 generous handfuls")).toEqual({
      ok: true,
      value: {
        mode: "text",
        amount: null,
        unit: null,
        text: "2 generous handfuls",
      },
    });
  });

  it("rejects non-string and overlong inputs", () => {
    expect(parsePantryQuantity(2)).toMatchObject({
      ok: false,
      code: "invalid_type",
    });
    expect(parsePantryQuantity("x".repeat(101))).toMatchObject({
      ok: false,
      code: "too_long",
    });
  });
});

describe("parsePantryQuantityInput", () => {
  it("preserves explicit structured counts instead of demoting bare amounts", () => {
    expect(parsePantryQuantityInput({
      mode: "structured",
      amount: "0011.000000",
      unit: "count",
    })).toEqual({
      ok: true,
      value: {
        mode: "structured",
        amount: "11",
        unit: "count",
        text: null,
      },
    });
  });

  it("keeps an explicitly selected text fallback as text", () => {
    expect(parsePantryQuantityInput({
      mode: "text",
      text: "  about half a bag  ",
    })).toEqual({
      ok: true,
      value: {
        mode: "text",
        amount: null,
        unit: null,
        text: "about half a bag",
      },
    });
  });

  it("accepts unknown mode and rejects malformed structured inputs", () => {
    expect(parsePantryQuantityInput({ mode: "unknown" })).toEqual({
      ok: true,
      value: {
        mode: "unknown",
        amount: null,
        unit: null,
        text: null,
      },
    });
    expect(parsePantryQuantityInput({
      mode: "structured",
      amount: "11",
      unit: "potato",
    })).toMatchObject({ ok: false, code: "invalid_unit" });
    expect(parsePantryQuantityInput({
      mode: "structured",
      amount: "eleven",
      unit: "count",
    })).toMatchObject({ ok: false, code: "invalid_type" });
  });

  it("retains legacy string parsing for existing website callers", () => {
    expect(parsePantryQuantityInput("3 lbs")).toMatchObject({
      ok: true,
      value: { mode: "structured", amount: "3", unit: "lb" },
    });
    expect(parsePantryQuantityInput("3")).toMatchObject({
      ok: true,
      value: { mode: "text", text: "3" },
    });
  });
});

describe("quantity presentation and equality", () => {
  it("formats counts without a unit and other structured values canonically", () => {
    const count = parsePantryQuantity("12 count");
    const weight = parsePantryQuantity("2 pounds");
    const text = parsePantryQuantity("about half");
    const unknown = parsePantryQuantity("");

    expect(count.ok && formatPantryQuantity(count.value)).toBe("12");
    expect(weight.ok && formatPantryQuantity(weight.value)).toBe("2 lb");
    expect(text.ok && formatPantryQuantity(text.value)).toBe("about half");
    expect(unknown.ok && formatPantryQuantity(unknown.value)).toBe("");
  });

  it("compares canonical structured values semantically", () => {
    const decimal = parsePantryQuantity("0.5 lb");
    const fraction = parsePantryQuantity("1/2 pounds");
    const otherUnit = parsePantryQuantity("0.5 kg");

    expect(decimal.ok && fraction.ok
      && pantryQuantitiesEqual(decimal.value, fraction.value)).toBe(true);
    expect(decimal.ok && otherUnit.ok
      && pantryQuantitiesEqual(decimal.value, otherUnit.value)).toBe(false);
    expect(pantryQuantitiesEqual(
      { mode: "structured", amount: "1.500000", unit: "l", text: null },
      { mode: "structured", amount: "1.5", unit: "l", text: null },
    )).toBe(true);
  });

  it("keeps unknown text comparisons lossless and case-sensitive", () => {
    const first = parsePantryQuantity("Half gallon");
    const same = parsePantryQuantity("  Half gallon ");
    const different = parsePantryQuantity("half gallon");

    expect(first.ok && same.ok
      && pantryQuantitiesEqual(first.value, same.value)).toBe(true);
    expect(first.ok && different.ok
      && pantryQuantitiesEqual(first.value, different.value)).toBe(false);
  });

  it("recognizes only canonical soft-enum unit values", () => {
    expect(isPantryQuantityUnit("lb")).toBe(true);
    expect(isPantryQuantityUnit("pounds")).toBe(false);
    expect(isPantryQuantityUnit("handful")).toBe(false);
  });

  it("distinguishes canonical-looking legacy text from structured storage", () => {
    const quantity = parsePantryQuantity("2 pounds");
    if (!quantity.ok) throw new Error(quantity.error);

    expect(pantryQuantityMatchesStoredFields(quantity.value, {
      quantity: "2 lb",
      quantity_text: "2 lb",
      quantity_value: null,
      quantity_unit: null,
    })).toBe(false);
    expect(pantryQuantityMatchesStoredFields(quantity.value, {
      quantity: "2 lb",
      quantity_text: "",
      quantity_value: "2.000000",
      quantity_unit: "lb",
    })).toBe(true);
  });
});

function structured(
  amount: string,
  unit: StructuredPantryQuantity["unit"] = "count",
): StructuredPantryQuantity {
  return {
    mode: "structured",
    amount,
    unit,
    text: null,
  };
}

describe("adjustStructuredPantryQuantity", () => {
  it("consumes an exact same-unit decimal amount without using floats", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("0.3", "kg"),
        structured("0.1", "kg"),
        "consume",
      ),
    ).toEqual({
      ok: true,
      code: "applied",
      value: structured("0.2", "kg"),
    });
  });

  it("allows consuming the full quantity and returns canonical zero", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("2.500000", "lb"),
        structured("2.5", "lb"),
        "consume",
      ),
    ).toEqual({
      ok: true,
      code: "applied",
      value: structured("0", "lb"),
    });
  });

  it("restocks same-unit quantities and removes insignificant zeroes", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("1.250000", "l"),
        structured("0.750000", "l"),
        "restock",
      ),
    ).toEqual({
      ok: true,
      code: "applied",
      value: structured("2", "l"),
    });
  });

  it("preserves exact six-place precision", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("0.000001", "g"),
        structured("0.000001", "g"),
        "restock",
      ),
    ).toEqual({
      ok: true,
      code: "applied",
      value: structured("0.000002", "g"),
    });
  });

  it.each(["0", "0.000000", "-1", "0.0000001", "not-a-number"])(
    "rejects invalid delta amount %s",
    (amount) => {
      expect(
        adjustStructuredPantryQuantity(
          structured("10", "count"),
          structured(amount, "count"),
          "consume",
        ),
      ).toEqual({ ok: false, code: "invalid_delta" });
    },
  );

  it("rejects mismatched units instead of converting them", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("1", "kg"),
        structured("100", "g"),
        "consume",
      ),
    ).toEqual({ ok: false, code: "unit_mismatch" });
  });

  it("does not let consumption take inventory below zero", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("1.5", "cup"),
        structured("1.500001", "cup"),
        "consume",
      ),
    ).toEqual({ ok: false, code: "insufficient_quantity" });
  });

  it("distinguishes an invalid stored amount from a valid overflow", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("not-a-number", "cup"),
        structured("1", "cup"),
        "consume",
      ),
    ).toEqual({ ok: false, code: "invalid_current" });
  });

  it("accepts a restock exactly at the maximum amount", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("999999999.999998", "ml"),
        structured("0.000001", "ml"),
        "restock",
      ),
    ).toEqual({
      ok: true,
      code: "applied",
      value: structured("999999999.999999", "ml"),
    });
  });

  it("does not let restocking exceed the maximum amount", () => {
    expect(
      adjustStructuredPantryQuantity(
        structured("999999999.999999", "ml"),
        structured("0.000001", "ml"),
        "restock",
      ),
    ).toEqual({ ok: false, code: "amount_exceeded" });
  });

  it("does not mutate either input quantity", () => {
    const current = structured("5", "can");
    const delta = structured("2", "can");

    adjustStructuredPantryQuantity(current, delta, "consume");

    expect(current).toEqual(structured("5", "can"));
    expect(delta).toEqual(structured("2", "can"));
  });
});
