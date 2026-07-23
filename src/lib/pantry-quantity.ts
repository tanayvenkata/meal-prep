const NUMERIC_SCALE = 6;
const ZERO = BigInt(0);
const TWO = BigInt(2);
const FIVE = BigInt(5);
const NUMERIC_SCALE_FACTOR = BigInt(1_000_000);
const MAX_SCALED_AMOUNT = BigInt("999999999999999");

export const MAX_PANTRY_QUANTITY_TEXT_LENGTH = 100;
export const MAX_PANTRY_QUANTITY_AMOUNT = "999999999.999999";

export const PANTRY_QUANTITY_UNITS = [
  "count",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "gal",
  "package",
  "bag",
  "bottle",
  "can",
  "carton",
  "jar",
  "bunch",
] as const;

export type PantryQuantityUnit = (typeof PANTRY_QUANTITY_UNITS)[number];

export type PantryQuantity =
  | {
      mode: "unknown";
      amount: null;
      unit: null;
      text: null;
    }
  | {
      mode: "structured";
      amount: string;
      unit: PantryQuantityUnit;
      text: null;
    }
  | {
      mode: "text";
      amount: null;
      unit: null;
      text: string;
    };

export type PantryQuantityParseResult =
  | { ok: true; value: PantryQuantity }
  | {
      ok: false;
      code:
        | "invalid_type"
        | "too_long"
        | "negative"
        | "non_finite"
        | "zero_denominator"
        | "non_terminating_fraction"
        | "scale_exceeded"
        | "amount_exceeded";
      error: string;
    };

export type StoredPantryQuantityFields = {
  quantity: string;
  quantity_text: string;
  quantity_value: string | null;
  quantity_unit: string | null;
};

export const UNKNOWN_PANTRY_QUANTITY: PantryQuantity = {
  mode: "unknown",
  amount: null,
  unit: null,
  text: null,
};

const UNIT_ALIASES: Readonly<Record<string, PantryQuantityUnit>> = {
  count: "count",
  counts: "count",
  ct: "count",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
  package: "package",
  packages: "package",
  pack: "package",
  packs: "package",
  pkg: "package",
  bag: "bag",
  bags: "bag",
  bottle: "bottle",
  bottles: "bottle",
  can: "can",
  cans: "can",
  carton: "carton",
  cartons: "carton",
  jar: "jar",
  jars: "jar",
  bunch: "bunch",
  bunches: "bunch",
};

function invalid(
  code: Exclude<PantryQuantityParseResult, { ok: true }>["code"],
  error: string,
): PantryQuantityParseResult {
  return { ok: false, code, error };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;

  while (b !== ZERO) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function formatScaledAmount(scaled: bigint): string {
  const integer = scaled / NUMERIC_SCALE_FACTOR;
  const fraction = (scaled % NUMERIC_SCALE_FACTOR)
    .toString()
    .padStart(NUMERIC_SCALE, "0")
    .replace(/0+$/, "");

  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

function validateScaledAmount(
  scaled: bigint,
): PantryQuantityParseResult | string {
  if (scaled > MAX_SCALED_AMOUNT) {
    return invalid(
      "amount_exceeded",
      `quantity amount must be ${MAX_PANTRY_QUANTITY_AMOUNT} or less`,
    );
  }

  return formatScaledAmount(scaled);
}

function parseDecimal(token: string): PantryQuantityParseResult | string | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return null;
  if (token.startsWith("-")) {
    return invalid("negative", "quantity amount cannot be negative");
  }

  const unsigned = token.startsWith("+") ? token.slice(1) : token;
  const [rawInteger = "0", rawFraction = ""] = unsigned.split(".");
  const fraction = rawFraction.replace(/0+$/, "");

  if (fraction.length > NUMERIC_SCALE) {
    return invalid(
      "scale_exceeded",
      `quantity amount supports at most ${NUMERIC_SCALE} decimal places`,
    );
  }

  const integer = BigInt(rawInteger === "" ? "0" : rawInteger);
  const scaled = integer * NUMERIC_SCALE_FACTOR
    + BigInt(fraction.padEnd(NUMERIC_SCALE, "0") || "0");

  return validateScaledAmount(scaled);
}

function parseFraction(
  token: string,
): PantryQuantityParseResult | string | null {
  const match = /^([+-]?\d+)\/([+-]?\d+)$/.exec(token);
  if (!match) return null;

  const [, numeratorToken, denominatorToken] = match;
  if (numeratorToken.startsWith("-") || denominatorToken.startsWith("-")) {
    return invalid("negative", "quantity amount cannot be negative");
  }

  const numerator = BigInt(
    numeratorToken.startsWith("+") ? numeratorToken.slice(1) : numeratorToken,
  );
  const denominator = BigInt(
    denominatorToken.startsWith("+")
      ? denominatorToken.slice(1)
      : denominatorToken,
  );

  if (denominator === ZERO) {
    return invalid(
      "zero_denominator",
      "quantity fraction denominator cannot be zero",
    );
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  let remainingDenominator = reducedDenominator;
  let powersOfTwo = 0;
  let powersOfFive = 0;

  while (remainingDenominator % TWO === ZERO) {
    remainingDenominator /= TWO;
    powersOfTwo += 1;
  }
  while (remainingDenominator % FIVE === ZERO) {
    remainingDenominator /= FIVE;
    powersOfFive += 1;
  }

  if (remainingDenominator !== BigInt(1)) {
    return invalid(
      "non_terminating_fraction",
      "quantity fraction must have an exact terminating decimal value",
    );
  }
  if (Math.max(powersOfTwo, powersOfFive) > NUMERIC_SCALE) {
    return invalid(
      "scale_exceeded",
      `quantity amount supports at most ${NUMERIC_SCALE} decimal places`,
    );
  }

  const scaled = reducedNumerator
    * (NUMERIC_SCALE_FACTOR / reducedDenominator);
  return validateScaledAmount(scaled);
}

function parseNumericToken(
  token: string,
): PantryQuantityParseResult | string | null {
  if (/^[+-]?(?:nan|inf(?:inity)?)$/i.test(token)) {
    return invalid("non_finite", "quantity amount must be finite");
  }

  return parseDecimal(token) ?? parseFraction(token);
}

function amountsEqual(left: string, right: string): boolean {
  const normalizedLeft = parseDecimal(left);
  const normalizedRight = parseDecimal(right);

  return typeof normalizedLeft === "string"
    && typeof normalizedRight === "string"
    && normalizedLeft === normalizedRight;
}

export function isPantryQuantityUnit(
  value: string,
): value is PantryQuantityUnit {
  return (PANTRY_QUANTITY_UNITS as readonly string[]).includes(value);
}

export function parsePantryQuantity(
  input: unknown,
): PantryQuantityParseResult {
  if (typeof input !== "string") {
    return invalid("invalid_type", "quantity must be a string");
  }

  const text = input.trim();
  if (text.length > MAX_PANTRY_QUANTITY_TEXT_LENGTH) {
    return invalid(
      "too_long",
      `quantity must be ${MAX_PANTRY_QUANTITY_TEXT_LENGTH} characters or fewer`,
    );
  }
  if (text === "") {
    return { ok: true, value: UNKNOWN_PANTRY_QUANTITY };
  }

  const [numericToken, ...unitParts] = text.split(/\s+/);
  const parsedAmount = parseNumericToken(numericToken);
  if (
    parsedAmount
    && typeof parsedAmount !== "string"
    && "code" in parsedAmount
  ) {
    const mayRemainText = numericToken.includes("/")
      && (
        parsedAmount.code === "non_terminating_fraction"
        || parsedAmount.code === "scale_exceeded"
      );
    if (!mayRemainText) return parsedAmount;
  }

  if (typeof parsedAmount === "string") {
    const unitText = unitParts.join(" ").toLowerCase();
    const unit = UNIT_ALIASES[unitText];

    if (unit) {
      return {
        ok: true,
        value: {
          mode: "structured",
          amount: parsedAmount,
          unit,
          text: null,
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      mode: "text",
      amount: null,
      unit: null,
      text,
    },
  };
}

export function formatPantryQuantity(quantity: PantryQuantity): string {
  if (quantity.mode === "unknown") return "";
  if (quantity.mode === "text") return quantity.text;
  if (quantity.unit === "count") return quantity.amount;
  return `${quantity.amount} ${quantity.unit}`;
}

export function pantryQuantitiesEqual(
  left: PantryQuantity,
  right: PantryQuantity,
): boolean {
  if (left.mode !== right.mode) return false;

  switch (left.mode) {
    case "unknown":
      return true;
    case "text":
      return left.text === (right.mode === "text" ? right.text : null);
    case "structured":
      return right.mode === "structured"
        && amountsEqual(left.amount, right.amount)
        && left.unit === right.unit;
  }
}

export function pantryQuantityMatchesStoredFields(
  quantity: PantryQuantity,
  stored: StoredPantryQuantityFields,
): boolean {
  switch (quantity.mode) {
    case "unknown":
      return stored.quantity_text === ""
        && stored.quantity_value === null
        && stored.quantity_unit === null;
    case "text":
      return stored.quantity_text === quantity.text
        && stored.quantity_value === null
        && stored.quantity_unit === null;
    case "structured":
      return stored.quantity_text === ""
        && stored.quantity_value !== null
        && stored.quantity_unit === quantity.unit
        && stored.quantity === formatPantryQuantity(quantity);
  }
}
