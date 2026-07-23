import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

const sql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);

const USER_ID = "00000000-0000-0000-0000-000000000d48";

beforeAll(async () => {
  await sql`
    insert into auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    )
    values (
      ${USER_ID},
      'structured-quantity@test.com',
      'x',
      now(),
      now(),
      now(),
      '{}',
      '{}'
    )
    on conflict (id) do nothing
  `;
});

beforeEach(async () => {
  await sql`delete from items where user_id = ${USER_ID}`;
});

afterAll(async () => {
  await sql`delete from items where user_id = ${USER_ID}`;
  await sql`delete from auth.users where id = ${USER_ID}`;
  await sql.end({ timeout: 5 });
});

describe("structured pantry quantity migration", () => {
  it("supports unknown, lossless text, and deterministic structured displays", async () => {
    const rows = await sql<
      {
        name: string;
        quantity_text: string | null;
        quantity_value: string | null;
        quantity_unit: string | null;
        quantity: string | null;
      }[]
    >`
      insert into items (
        user_id,
        name,
        quantity_text,
        quantity_value,
        quantity_unit
      )
      values
        (${USER_ID}, 'Unknown', '', null, null),
        (${USER_ID}, 'Legacy', '  half gallon  ', null, null),
        (${USER_ID}, 'Structured', '', 12.340000, 'fluid_ounce'),
        (${USER_ID}, 'Count', '', 12.000000, 'count')
      returning
        name,
        quantity_text,
        quantity_value,
        quantity_unit,
        quantity
    `;

    expect(rows).toEqual([
      {
        name: "Unknown",
        quantity_text: "",
        quantity_value: null,
        quantity_unit: null,
        quantity: "",
      },
      {
        name: "Legacy",
        quantity_text: "  half gallon  ",
        quantity_value: null,
        quantity_unit: null,
        quantity: "  half gallon  ",
      },
      {
        name: "Structured",
        quantity_text: "",
        quantity_value: "12.340000",
        quantity_unit: "fluid_ounce",
        quantity: "12.34 fluid_ounce",
      },
      {
        name: "Count",
        quantity_text: "",
        quantity_value: "12.000000",
        quantity_unit: "count",
        quantity: "12",
      },
    ]);
  });

  it("rejects mixed or incomplete storage modes", async () => {
    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_text,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Mixed', 'two', 2, 'count')
      `,
    ).rejects.toThrow(/items_quantity_mode_check|check constraint/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity_value)
        values (${USER_ID}, 'Missing unit', 2)
      `,
    ).rejects.toThrow(/items_quantity_mode_check|check constraint/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity_unit)
        values (${USER_ID}, 'Missing value', 'count')
      `,
    ).rejects.toThrow(/items_quantity_mode_check|check constraint/i);
  });

  it("rejects invalid values, units, text, and generated-column writes", async () => {
    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Negative', -0.000001, 'count')
      `,
    ).rejects.toThrow(
      /items_quantity_value_range_check|check constraint/i,
    );

    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Over limit', 1000000000, 'count')
      `,
    ).rejects.toThrow(
      /items_quantity_value_range_check|check constraint/i,
    );

    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Not a number', 'NaN'::numeric, 'count')
      `,
    ).rejects.toThrow(
      /items_quantity_value_range_check|check constraint/i,
    );

    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Infinity', 'Infinity'::numeric, 'count')
      `,
    ).rejects.toThrow(
      /items_quantity_value_range_check|check constraint/i,
    );

    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Over precision', 1.1234564, 'count')
      `,
    ).rejects.toThrow(
      /items_quantity_value_scale_check|check constraint/i,
    );

    await expect(
      sql`
        insert into items (
          user_id,
          name,
          quantity_value,
          quantity_unit
        )
        values (${USER_ID}, 'Bad unit', 1, 'Fluid Ounce')
      `,
    ).rejects.toThrow(/items_quantity_unit_format_check|check constraint/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity_text)
        values (${USER_ID}, 'Blank text', '   ')
      `,
    ).rejects.toThrow(/items_quantity_text_length_check|check constraint/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity_text)
        values (${USER_ID}, 'Long text', ${"a".repeat(101)})
      `,
    ).rejects.toThrow(/items_quantity_text_length_check|check constraint/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity)
        values (${USER_ID}, 'Generated write', '2 count')
      `,
    ).rejects.toThrow(/generated column|cannot insert/i);
  });

  it("supports zero and preserves accepted six-decimal values exactly", async () => {
    const [zero] = await sql<{ quantity: string }[]>`
      insert into items (user_id, name, quantity_value, quantity_unit)
      values (${USER_ID}, 'Zero', 0, 'count')
      returning quantity
    `;

    expect(zero.quantity).toBe("0");

    const [precise] = await sql<
      { quantity_value: string; quantity: string }[]
    >`
      insert into items (user_id, name, quantity_value, quantity_unit)
      values (${USER_ID}, 'Precise', 1.123456, 'count')
      returning quantity_value, quantity
    `;

    expect(precise).toEqual({
      quantity_value: "1.123456",
      quantity: "1.123456",
    });
  });
});
