/** Persistent pilot runs use REAL app_ticket rows and the ADMIN account wallet. */
export const REAL_MARKET_LAB_SQL = [
  `create table if not exists app_real_market_test_run (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references app_user(id) on delete restrict,
    request_id uuid not null,
    stake_per_ticket numeric(14,2) not null check(stake_per_ticket >= 100),
    requested_tickets int not null check(requested_tickets between 1 and 20),
    selected_matches int not null default 0,
    coverage jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique(actor_id, request_id)
  )`,
  `create table if not exists app_real_market_test_case (
    id uuid primary key,
    run_id uuid not null references app_real_market_test_run(id) on delete restrict,
    match_id bigint not null,
    match_name text not null,
    market_key text not null,
    market_name text not null,
    market_line text not null default '',
    outcome_key text not null,
    outcome_name text not null,
    quoted_odds numeric(14,4) not null,
    selection jsonb not null,
    contract jsonb not null,
    placement_status text not null default 'QUEUED'
      check(placement_status in ('QUEUED','PLACING','PLACED','REJECTED')),
    claim_at timestamptz,
    ticket_id uuid unique references app_ticket(id) on delete restrict,
    rejected_reason text,
    rejected_code text,
    placed_at timestamptz,
    expected_status text,
    audit_status text not null default 'WAITING',
    audit_reason text,
    last_checked_at timestamptz,
    created_at timestamptz not null default now(),
    unique(run_id, match_id, market_key, market_line, outcome_key)
  )`,
  `create index if not exists app_real_market_test_queue_idx
    on app_real_market_test_case(placement_status,created_at)
    where placement_status in ('QUEUED','PLACING')`,
  `create index if not exists app_real_market_test_ticket_idx
    on app_real_market_test_case(ticket_id)
    where ticket_id is not null`,
].join(';\n')+';';
