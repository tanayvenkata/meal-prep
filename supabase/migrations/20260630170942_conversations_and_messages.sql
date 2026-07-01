create table conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  title      text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_id_idx on messages(conversation_id);
