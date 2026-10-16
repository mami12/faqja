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

create table if not exists app_commission_config (
  id         smallint primary key check (id = 1),
  single_pct numeric(5,2) not null default 3 check (single_pct >= 0 and single_pct <= 100),
  double_pct numeric(5,2) not null default 5 check (double_pct >= 0 and double_pct <= 100),
  multi_pct  numeric(5,2) not null default 7 check (multi_pct >= 0 and multi_pct <= 100),
  updated_by uuid references app_user(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into app_commission_config (id) values (1) on conflict (id) do nothing;

create table if not exists app_player_controls (
  user_id                uuid primary key references app_user(id) on delete cascade,
  daily_limit            numeric(14,2),
  weekly_limit           numeric(14,2),
  monthly_limit          numeric(14,2),
  pending_limits         jsonb,
  limits_effective_at    timestamptz,
  self_excluded_until    timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists app_player_controls_exclusion_idx on app_player_controls (self_excluded_until);

-- The single locked row also serializes liability calculations across players.
create table if not exists app_live_risk_settings (
  id smallint primary key check (id = 1),
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user(id) on delete set null
);

create table if not exists app_admin_audit (
  id            bigserial primary key,
  actor_id      uuid references app_user(id) on delete set null,
  actor_name    text not null,
  actor_role    text not null,
  action        text not null,
  target_type   text not null,
  target_id     text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists app_admin_audit_created_idx on app_admin_audit (created_at desc);
create index if not exists app_admin_audit_actor_idx on app_admin_audit (actor_id, created_at desc);

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
-- A request from the browser may be retried or delivered twice. Enforce exactly
-- one real ticket per player + request key at the database boundary.
alter table app_ticket add column if not exists client_request_id uuid;
alter table app_ticket add column if not exists request_payload_hash text;
create unique index if not exists app_ticket_user_request_uidx
  on app_ticket (user_id, client_request_id)
  where client_request_id is not null;

create index if not exists app_ticket_user_idx   on app_ticket (user_id, placed_at desc);
create index if not exists app_ticket_status_idx on app_ticket (status);

-- Atomic, idempotent multi-column bets: all tickets and the wallet debit commit together.
create table if not exists app_ticket_batch (
  user_id uuid not null references app_user(id) on delete cascade,
  client_request_id uuid not null,
  request_payload_hash text not null,
  ticket_ids uuid[] not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_request_id)
);

-- Universal admin-defined same-game builders. Each leg is a supported outcome contract.
create table if not exists app_bet_builder_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legs jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
alter table app_ticket_line add column if not exists builder_legs jsonb;
create index if not exists app_ticket_line_ticket_idx on app_ticket_line (ticket_id);
create index if not exists app_ticket_line_match_idx  on app_ticket_line (match_id);

-- final results, persisted the moment a match is seen finished: settlement must work even
-- if the process restarts or the match later leaves the feed
create table if not exists app_match_result (
  match_id     bigint primary key,
  home_team    text,
  away_team    text,
  home_score   int not null,
  away_score   int not null,
  corners_home int,
  corners_away int,
  cards_home   int,
  cards_away   int,
  finished_at  timestamptz not null default now(),
  settled_at   timestamptz
);

alter table app_match_result add column if not exists half_home_score int;
alter table app_match_result add column if not exists half_away_score int;

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