-- RxGuard schema - plan.md Section 5
-- Cloud Supabase project. Roles: clinician, pharmacist, researcher, admin.

-- ============================================================================
-- Enums
-- ============================================================================

create type public.user_role as enum ('clinician', 'pharmacist', 'researcher', 'admin');
create type public.severity_level as enum ('critical', 'high', 'moderate', 'low', 'safe');
create type public.drug_verdict as enum ('safe', 'caution', 'avoid');
create type public.prescription_status as enum ('draft', 'interviewing', 'completed', 'cancelled');
create type public.engine_type as enum ('ai', 'manual');

-- ============================================================================
-- Auth / profiles
-- ============================================================================

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    role public.user_role not null default 'clinician',
    display_name text,
    created_at timestamptz not null default now()
);

-- Every Auth signup gets a profile row (default role: clinician).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
    );
    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Role helper used by RLS policies (never runs as the caller's own privileges
-- for the profile lookup itself).
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

-- ============================================================================
-- Clinical data
-- ============================================================================

create table public.patients (
    id uuid primary key default gen_random_uuid(),
    created_by uuid not null references public.profiles (id),
    name text not null,
    age int,
    gender text,
    weight_kg numeric(5, 2),
    height_cm numeric(5, 2),
    pregnant boolean,
    breastfeeding boolean,
    created_at timestamptz not null default now()
);

create table public.prescriptions (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references public.patients (id) on delete cascade,
    clinician_id uuid not null references public.profiles (id),
    status public.prescription_status not null default 'draft',
    created_at timestamptz not null default now()
);

create table public.prescription_items (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions (id) on delete cascade,
    drug_name text not null,
    rxcui text,
    dosage text,
    route text
);

create table public.interview_sessions (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions (id) on delete cascade,
    status text not null default 'in_progress',
    started_at timestamptz not null default now(),
    completed_at timestamptz
);

create table public.interview_responses (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.interview_sessions (id) on delete cascade,
    field_name text not null,
    question_text text not null,
    answer jsonb not null,
    answered_at timestamptz not null default now()
);

create table public.drug_assessments (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions (id) on delete cascade,
    drug_name text not null,
    verdict public.drug_verdict not null,
    driving_factor text,
    side_effects text,
    source_citation text not null,
    created_at timestamptz not null default now()
);

create table public.interaction_results (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions (id) on delete cascade,
    drug_a text not null,
    drug_b text not null,
    severity public.severity_level not null,
    mechanism text,
    explanation text,
    engine public.engine_type not null default 'ai',
    created_at timestamptz not null default now()
);

-- ============================================================================
-- Grounding layer (seed data loaded from data/*.csv via 0002_seed_data.sql)
-- ============================================================================

create table public.drug_mapping (
    id serial primary key,
    drug_name text not null unique,
    rxcui text,
    drug_class text,
    mechanism_flag int not null default 0,
    risk_factor_flag int not null default 0
);

create table public.interactions_seed (
    id serial primary key,
    drug_a text not null,
    drug_b text not null,
    severity public.severity_level not null,
    mechanism text,
    action text,
    unique (drug_a, drug_b)
);

create table public.drug_patient_risk_rules (
    id serial primary key,
    drug_name text not null,
    trigger_type text not null,
    trigger_condition text not null,
    risk_level public.drug_verdict not null,
    effect text,
    recommended_action text
);

-- ============================================================================
-- Comparative evaluation (plan.md Section 5 / prompt.md Module 4)
-- ============================================================================

create table public.benchmark_cases (
    id serial primary key,
    description text not null,
    drug_list jsonb not null,
    expected_results jsonb not null
);

create table public.evaluation_runs (
    id uuid primary key default gen_random_uuid(),
    engine public.engine_type not null,
    accuracy numeric(6, 4),
    precision numeric(6, 4),
    recall numeric(6, 4),
    f1 numeric(6, 4),
    fpr numeric(6, 4),
    fnr numeric(6, 4),
    avg_time_ms numeric(10, 2),
    created_at timestamptz not null default now()
);

-- ============================================================================
-- Audit (append-only: INSERT + SELECT policies only, no UPDATE/DELETE grants)
-- ============================================================================

create table public.audit_log (
    id bigserial primary key,
    actor_id uuid references public.profiles (id),
    action text not null,
    entity_type text not null,
    entity_id text,
    before jsonb,
    after jsonb,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_responses enable row level security;
alter table public.drug_assessments enable row level security;
alter table public.interaction_results enable row level security;
alter table public.drug_mapping enable row level security;
alter table public.interactions_seed enable row level security;
alter table public.drug_patient_risk_rules enable row level security;
alter table public.benchmark_cases enable row level security;
alter table public.evaluation_runs enable row level security;
alter table public.audit_log enable row level security;

-- profiles ---------------------------------------------------------------
create policy profiles_select_own on public.profiles
    for select using (id = auth.uid());
create policy profiles_select_admin on public.profiles
    for select using (public.current_user_role() = 'admin');
create policy profiles_update_own on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- patients: clinician/pharmacist manage their own; admin everything --------
create policy patients_owner_all on public.patients
    for all using (created_by = auth.uid());
create policy patients_admin_all on public.patients
    for all using (public.current_user_role() = 'admin');

-- prescriptions ----------------------------------------------------------
create policy prescriptions_owner_all on public.prescriptions
    for all using (clinician_id = auth.uid());
create policy prescriptions_admin_all on public.prescriptions
    for all using (public.current_user_role() = 'admin');

-- prescription_items: keyed to the owning prescription --------------------
create policy items_owner_all on public.prescription_items
    for all using (
        exists (
            select 1 from public.prescriptions
            where prescriptions.id = prescription_id
              and prescriptions.clinician_id = auth.uid()
        )
    );
create policy items_admin_all on public.prescription_items
    for all using (public.current_user_role() = 'admin');

-- interview sessions/responses: same owner chain --------------------------
create policy sessions_owner_all on public.interview_sessions
    for all using (
        exists (
            select 1 from public.prescriptions
            where prescriptions.id = prescription_id
              and prescriptions.clinician_id = auth.uid()
        )
    );
create policy sessions_admin_all on public.interview_sessions
    for all using (public.current_user_role() = 'admin');

create policy responses_owner_all on public.interview_responses
    for all using (
        exists (
            select 1 from public.interview_sessions s
            join public.prescriptions p on p.id = s.prescription_id
            where s.id = session_id and p.clinician_id = auth.uid()
        )
    );
create policy responses_admin_all on public.interview_responses
    for all using (public.current_user_role() = 'admin');

-- assessments / interaction results: owner read; admin all ----------------
create policy assessments_owner_read on public.drug_assessments
    for select using (
        exists (
            select 1 from public.prescriptions
            where prescriptions.id = prescription_id
              and prescriptions.clinician_id = auth.uid()
        )
    );
create policy assessments_admin_all on public.drug_assessments
    for all using (public.current_user_role() = 'admin');

create policy interactions_owner_read on public.interaction_results
    for select using (
        exists (
            select 1 from public.prescriptions
            where prescriptions.id = prescription_id
              and prescriptions.clinician_id = auth.uid()
        )
    );
create policy interactions_admin_all on public.interaction_results
    for all using (public.current_user_role() = 'admin');

-- grounding tables: read for any authenticated user -----------------------
create policy grounding_read on public.drug_mapping
    for select using (auth.role() = 'authenticated');
create policy grounding_read on public.interactions_seed
    for select using (auth.role() = 'authenticated');
create policy grounding_read on public.drug_patient_risk_rules
    for select using (auth.role() = 'authenticated');

-- benchmark / evaluation: researcher + admin read; admin write ------------
create policy benchmark_read on public.benchmark_cases
    for select using (public.current_user_role() in ('researcher', 'admin'));
create policy benchmark_admin_all on public.benchmark_cases
    for all using (public.current_user_role() = 'admin');

create policy eval_read on public.evaluation_runs
    for select using (public.current_user_role() in ('researcher', 'admin'));
create policy eval_admin_insert on public.evaluation_runs
    for insert with check (public.current_user_role() = 'admin');

-- audit: append-only — INSERT for authenticated, SELECT for researcher/admin
create policy audit_insert on public.audit_log
    for insert with check (auth.role() = 'authenticated');
create policy audit_select on public.audit_log
    for select using (public.current_user_role() in ('researcher', 'admin'));