// Browser-only HTTP boundary for pantry CRUD. Components own presentation
// state; this module alone knows how the website authenticates and speaks to
// /api/pantry.
import { getToken } from "@/lib/supabase";

const PANTRY_URL = "/api/pantry";

export type Turnover = "high" | "low";

export type PantryItem = {
  id: number;
  name: string;
  quantity: string;
  turnover: Turnover;
  created_at: string;
};

export type AddPantryItemInput = {
  name: string;
  quantity: string;
  turnover: Turnover;
};

export type UpdatePantryItemInput = AddPantryItemInput & {
  id: number;
};

type PantryErrorBody = {
  code?: unknown;
  error?: unknown;
};

export class PantryApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PantryApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: object,
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new PantryApiError("Your session has expired. Sign in again.", 401);
  }
  const response = await fetch(PANTRY_URL, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as
      | PantryErrorBody
      | null;
    const message = typeof errorBody?.error === "string"
      ? errorBody.error
      : `Pantry request failed (${response.status}).`;
    const code = typeof errorBody?.code === "string" ? errorBody.code : null;
    throw new PantryApiError(message, response.status, code);
  }

  return response.json() as Promise<T>;
}

export const pantryApi = {
  list(): Promise<PantryItem[]> {
    return request<PantryItem[]>("GET");
  },

  add(input: AddPantryItemInput): Promise<PantryItem> {
    return request<PantryItem>("POST", input);
  },

  update(input: UpdatePantryItemInput): Promise<PantryItem> {
    return request<PantryItem>("PUT", input);
  },

  async remove(id: number): Promise<void> {
    await request<{ success: true }>("DELETE", { id });
  },
};
