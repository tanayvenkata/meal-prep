import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createConversation, listConversations, getConversation, getMessages, addMessage } from "@/lib/db";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const TEST_USER_A = "00000000-0000-0000-0000-000000000003";
const TEST_USER_B = "00000000-0000-0000-0000-000000000004";

const id = () => crypto.randomUUID();

beforeAll(async () => {
  await sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (${TEST_USER_A}, 'conv-user-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'conv-user-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql.end();
});

beforeEach(async () => {
  await sql`delete from conversations where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
});

afterEach(async () => {
  await sql`delete from conversations where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
});

describe("createConversation", () => {
  it("inserts a conversation and returns it with the correct values", async () => {
    const newId = id();
    const convo = await createConversation(TEST_USER_A, "what can I make with eggs", newId);

    expect(convo.id).toBe(newId);
    expect(convo.title).toBe("what can I make with eggs");
    expect(convo.user_id).toBe(TEST_USER_A);
    expect(convo.created_at).toBeDefined();
  });
});

describe("listConversations", () => {
  it("returns only conversations belonging to the given user", async () => {
    await createConversation(TEST_USER_A, "eggs chat", id());
    await createConversation(TEST_USER_B, "milk chat", id());

    const convos = await listConversations(TEST_USER_A);

    const titles = convos.map((c) => c.title);
    expect(titles).toContain("eggs chat");
    expect(titles).not.toContain("milk chat");
    expect(convos.every((c) => c.user_id === TEST_USER_A)).toBe(true);
  });

  it("returns conversations newest first", async () => {
    await createConversation(TEST_USER_A, "first chat", id());
    await createConversation(TEST_USER_A, "second chat", id());

    const convos = await listConversations(TEST_USER_A);

    expect(convos[0].title).toBe("second chat");
    expect(convos[1].title).toBe("first chat");
  });
});

describe("getConversation", () => {
  it("returns the conversation for the correct user", async () => {
    const created = await createConversation(TEST_USER_A, "eggs chat", id());

    const found = await getConversation(TEST_USER_A, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe("eggs chat");
  });

  it("returns null if the conversation belongs to a different user", async () => {
    const created = await createConversation(TEST_USER_B, "milk chat", id());

    const found = await getConversation(TEST_USER_A, created.id);

    expect(found).toBeNull();
  });

  it("returns null if the conversation does not exist", async () => {
    const found = await getConversation(TEST_USER_A, "00000000-0000-0000-0000-000000000000");

    expect(found).toBeNull();
  });
});

describe("addMessage + getMessages", () => {
  it("inserts a message and returns it with correct values", async () => {
    const convo = await createConversation(TEST_USER_A, "eggs chat", id());

    const msg = await addMessage(convo.id, "user", "what can I make with eggs?");

    expect(msg.conversation_id).toBe(convo.id);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("what can I make with eggs?");
    expect(msg.id).toBeDefined();
  });

  it("getMessages returns messages in chronological order", async () => {
    const convo = await createConversation(TEST_USER_A, "eggs chat", id());
    await addMessage(convo.id, "user", "what can I make with eggs?");
    await addMessage(convo.id, "assistant", "frittata, easy.");

    const messages = await getMessages(convo.id);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("messages are deleted when their conversation is deleted (cascade)", async () => {
    const convo = await createConversation(TEST_USER_A, "eggs chat", id());
    await addMessage(convo.id, "user", "what can I make with eggs?");

    await sql`delete from conversations where id = ${convo.id}`;

    const messages = await getMessages(convo.id);
    expect(messages).toHaveLength(0);
  });
});
