/**
 * Ledger schema - users, money, tickets.
 *
 * The live board (matches + odds) stays in memory and never touches these tables, so a
 * database outage still leaves the board serving. This is only what must survive a
 * restart for the betting part: who the users are, how their money moved, and the
 * tickets they placed (with the price frozen at placement time).
 *
 * Every statement is idempotent and CREATE-only: nothing that already exists is altered.
 * Tables are prefixed `app_` so they cannot collide with the board's own tables.
 */
export const LEDGER_SQL = `
create table if not exists app_user (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  role          text not null default 'PLAYER',   -- ADMIN | MANAGER | PLAYER
  status        text not null default 'ACTIVE',   -- ACTIVE | FROZEN | BANNED
  balance       numeric(14,2) not null default 0,
  currency      text not null default 'LEK',
  manager_id    uuid references app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists app_user_role_idx    on app_user (role);
create index if not exists app_user_manager_idx on app_user (manager_id);

-- every balance movement is recorded with the balance it produced (auditable wallet)
create table if not exists app_transaction (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  amount        numeric(14,2) not null,
  type          text not null,                    -- DEPOSIT | WITHDRAWAL | BET_PLACED | BET_WON | BET_REFUND | TICKET_REVERT
  reference_id  uuid,
  balance_after numeric(14,2) not null,
  description   text,
  created_at    timestamptz not null default now()
);
create index if not exists app_transaction_user_idx on app_transaction (user_id, created_at desc);

create table if not exists app_ticket (
  id               uuid primary key default gen_random_uuid(),
  booking_code     text unique,
  user_id          uuid references app_user(id) on delete set null,
  stake            numeric(14,2) not null,
  total_odds       numeric(14,4) not null,
  potential_payout numeric(14,2) not null,
  ticket_type      text not null default 'SINGLE', -- SINGLE | COMBO | SYSTEM
  system_type      text,
  status           text not null default 'PENDING',-- PENDING | WON | LOST | CANCELLED | VOID | REVERTED
  placed_at        timestamptz not null default now(),
  settled_at       timestamptz
);
create index if not exists app_ticket_user_idx   on app_ticket (user_id, placed_at desc);
create index if not exists app_ticket_status_idx on app_ticket (status);

-- names and odds are snapshotted here, so settlement never depends on the live feed
create table if not exists app_ticket_line (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references app_ticket(id) on delete cascade,
  match_id         bigint not null,
  market_key       text not null,
  line             text not null default '',
  outcome_key      text not null,
  outcome_name     text not null,
  market_name      text not null,
  match_name       text not null,
  odds_at_placement numeric(14,4) not null,
  status           text not null default 'PENDING' -- PENDING | WON | LOST | VOID
);
create index if not exists app_ticket_line_ticket_idx on app_ticket_line (ticket_id);
create index if not exists app_ticket_line_match_idx  on app_ticket_line (match_id);

-- admin overrides survive the next feed frame (suspend a match/market/outcome, pin a price)
create table if not exists app_feed_override (
  kind        text not null,      -- match | market | outcome
  ref         text not null,      -- matchId | matchId|market|line | matchId|market|line|outcome
  suspended   boolean,
  price       numeric(14,4),
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (kind, ref)
);
`;