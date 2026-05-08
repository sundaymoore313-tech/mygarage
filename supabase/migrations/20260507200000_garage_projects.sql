-- ─────────────────────────────────────────────────────────────────────────────
-- garage_projects: per-user saved car project storage
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.garage_projects (
  user_id              uuid    not null references auth.users(id) on delete cascade,
  project_id           text    not null,
  name                 text    not null default 'Untitled Car Project',
  car_name             text    not null default '',
  model_url            text    not null default '',
  ground_offset_y      float8,
  preview_image_url    text,
  paint_color_hex      text    not null default '#ffffff',
  layer_count          int     not null default 0,
  custom_decal_count   int     not null default 0,
  created_at_ms        bigint  not null default 0,
  updated_at_ms        bigint  not null default 0,
  project_json         jsonb,
  target_paints_json   jsonb,
  target_prints_json   jsonb,
  primary key (user_id, project_id)
);

alter table public.garage_projects enable row level security;

drop policy if exists "Users can read own projects" on public.garage_projects;
create policy "Users can read own projects"
  on public.garage_projects for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on public.garage_projects;
create policy "Users can insert own projects"
  on public.garage_projects for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on public.garage_projects;
create policy "Users can update own projects"
  on public.garage_projects for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own projects" on public.garage_projects;
create policy "Users can delete own projects"
  on public.garage_projects for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: save_garage_project  (upsert a full project)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.save_garage_project(
  p_project_id         text,
  p_name               text,
  p_car_name           text,
  p_model_url          text,
  p_ground_offset_y    float8,
  p_preview_image_url  text,
  p_paint_color_hex    text,
  p_layer_count        int,
  p_custom_decal_count int,
  p_created_at_ms      bigint,
  p_updated_at_ms      bigint,
  p_project_json       jsonb,
  p_target_paints_json jsonb,
  p_target_prints_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.garage_projects (
    user_id, project_id, name, car_name, model_url,
    ground_offset_y, preview_image_url, paint_color_hex,
    layer_count, custom_decal_count, created_at_ms, updated_at_ms,
    project_json, target_paints_json, target_prints_json
  ) values (
    auth.uid(), p_project_id, p_name, p_car_name, p_model_url,
    p_ground_offset_y, p_preview_image_url, p_paint_color_hex,
    p_layer_count, p_custom_decal_count, p_created_at_ms, p_updated_at_ms,
    p_project_json, p_target_paints_json, p_target_prints_json
  )
  on conflict (user_id, project_id) do update set
    name               = excluded.name,
    car_name           = excluded.car_name,
    model_url          = excluded.model_url,
    ground_offset_y    = excluded.ground_offset_y,
    preview_image_url  = excluded.preview_image_url,
    paint_color_hex    = excluded.paint_color_hex,
    layer_count        = excluded.layer_count,
    custom_decal_count = excluded.custom_decal_count,
    updated_at_ms      = excluded.updated_at_ms,
    project_json       = excluded.project_json,
    target_paints_json = excluded.target_paints_json,
    target_prints_json = excluded.target_prints_json;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: list_garage_project_cards  (light listing, no project_json)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_garage_project_cards()
returns table (
  project_id           text,
  name                 text,
  car_name             text,
  model_url            text,
  ground_offset_y      float8,
  preview_image_url    text,
  paint_color_hex      text,
  layer_count          int,
  custom_decal_count   int,
  created_at_ms        bigint,
  updated_at_ms        bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      gp.project_id,
      gp.name,
      gp.car_name,
      gp.model_url,
      gp.ground_offset_y,
      gp.preview_image_url,
      gp.paint_color_hex,
      gp.layer_count,
      gp.custom_decal_count,
      gp.created_at_ms,
      gp.updated_at_ms
    from public.garage_projects gp
    where gp.user_id = auth.uid()
    order by gp.updated_at_ms desc
    limit 24;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_garage_project  (full project by id)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_garage_project(p_project_id text)
returns table (
  project_id           text,
  name                 text,
  car_name             text,
  model_url            text,
  ground_offset_y      float8,
  preview_image_url    text,
  paint_color_hex      text,
  layer_count          int,
  custom_decal_count   int,
  created_at_ms        bigint,
  updated_at_ms        bigint,
  project_json         jsonb,
  target_paints_json   jsonb,
  target_prints_json   jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      gp.project_id,
      gp.name,
      gp.car_name,
      gp.model_url,
      gp.ground_offset_y,
      gp.preview_image_url,
      gp.paint_color_hex,
      gp.layer_count,
      gp.custom_decal_count,
      gp.created_at_ms,
      gp.updated_at_ms,
      gp.project_json,
      gp.target_paints_json,
      gp.target_prints_json
    from public.garage_projects gp
    where gp.user_id = auth.uid()
      and gp.project_id = p_project_id
    limit 1;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: delete_garage_project
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_garage_project(p_project_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.garage_projects
  where user_id = auth.uid()
    and project_id = p_project_id;
end;
$$;
