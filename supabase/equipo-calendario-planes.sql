-- ritual. — equipo, calendario sincronizado y planes
-- Córrelo una sola vez en Supabase → SQL Editor. Se puede volver a correr sin problema.

-- ═══ 1. PLANES ═══════════════════════════════════════════════════════════
-- El plan de cada cuenta lo asignas tú (Table Editor → ritual_plans). La app no deja cambiarlo.
-- Mientras estás en pruebas, quien no tenga fila tiene 'profesional'.
-- Cuando empieces a cobrar, cambia 'profesional' por 'sencillo' en la función de abajo.
create table if not exists public.ritual_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('sencillo','mediano','profesional')),
  updated_at timestamptz not null default now()
);
alter table public.ritual_plans enable row level security;
drop policy if exists "cada quien ve su plan" on public.ritual_plans;
create policy "cada quien ve su plan" on public.ritual_plans for select to authenticated using (user_id = auth.uid());

create or replace function public.ritual_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select plan from public.ritual_plans where user_id = uid), 'profesional')
$$;

-- ═══ 2. EQUIPO ═══════════════════════════════════════════════════════════
create table if not exists public.ritual_members (
  owner uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (owner, email)
);
alter table public.ritual_members enable row level security;
drop policy if exists "jefe gestiona su equipo" on public.ritual_members;
create policy "jefe gestiona su equipo" on public.ritual_members for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and public.ritual_plan(auth.uid()) = 'profesional');
drop policy if exists "colaborador ve sus invitaciones" on public.ritual_members;
create policy "colaborador ve sus invitaciones" on public.ritual_members for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Datos: el jefe ve todo lo suyo; cada colaborador solo su lista de trabajos y el nombre del negocio.
drop policy if exists "cada cuenta ve y edita lo suyo" on public.ritual_data;
drop policy if exists "dueno todo" on public.ritual_data;
create policy "dueno todo" on public.ritual_data for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "colaborador lee sus trabajos" on public.ritual_data;
create policy "colaborador lee sus trabajos" on public.ritual_data for select to authenticated
  using (key in ('jobs:' || lower(auth.jwt() ->> 'email'), 'name')
         and exists (select 1 from public.ritual_members m where m.owner = ritual_data.owner and lower(m.email) = lower(auth.jwt() ->> 'email')));
drop policy if exists "colaborador actualiza sus trabajos" on public.ritual_data;
create policy "colaborador actualiza sus trabajos" on public.ritual_data for update to authenticated
  using (key = 'jobs:' || lower(auth.jwt() ->> 'email')
         and exists (select 1 from public.ritual_members m where m.owner = ritual_data.owner and lower(m.email) = lower(auth.jwt() ->> 'email')))
  with check (key = 'jobs:' || lower(auth.jwt() ->> 'email'));

-- Cambios en vivo (para que el jefe vea al momento cuando alguien marca un trabajo como hecho)
do $$ begin
  alter publication supabase_realtime add table public.ritual_data;
exception when duplicate_object then null; end $$;

-- ═══ 3. CALENDARIO (Google / Apple) ══════════════════════════════════════
create table if not exists public.ritual_cal (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text unique not null default replace(gen_random_uuid()::text, '-', '')
);
alter table public.ritual_cal enable row level security;
drop policy if exists "mi link de calendario" on public.ritual_cal;
create policy "mi link de calendario" on public.ritual_cal for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Devuelve las citas propias y los trabajos asignados de quien tenga el link secreto.
create or replace function public.ritual_calendar(tok text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; mail text;
begin
  select user_id into uid from public.ritual_cal where token = tok;
  if uid is null then return null; end if;
  select lower(email) into mail from auth.users where id = uid;
  return jsonb_build_object(
    'own', jsonb_build_object(
      'name',     (select value from public.ritual_data where owner = uid and key = 'name'),
      'appts',    (select value from public.ritual_data where owner = uid and key = 'appts'),
      'services', (select value from public.ritual_data where owner = uid and key = 'services'),
      'projects', (select value from public.ritual_data where owner = uid and key = 'projects'),
      'clients',  (select value from public.ritual_data where owner = uid and key = 'clients')),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'biz', (select n.value from public.ritual_data n where n.owner = m.owner and n.key = 'name'),
        'jobs', d.value))
      from public.ritual_members m
      join public.ritual_data d on d.owner = m.owner and d.key = 'jobs:' || lower(m.email)
      where lower(m.email) = mail), '[]'::jsonb));
end $$;
revoke all on function public.ritual_calendar(text) from public;
grant execute on function public.ritual_calendar(text) to anon, authenticated;
