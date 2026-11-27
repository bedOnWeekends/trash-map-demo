create schema booth;
revoke all on schema booth from public, anon, authenticated;
grant usage on schema booth to service_role;
alter default privileges in schema booth revoke execute on functions from public;
create type booth.waste as enum ('general','plastic','paper','can','glass','liquid');
create domain booth.waste_list as booth.waste[] check (cardinality(value) between 1 and 6 and array_position(value,null) is null);
create table booth.zones(id text primary key,name text not null,lat float8 not null,lng float8 not null,boundary polygon not null);
insert into booth.zones values ('anniversary','60주년기념관',37.451016,126.654277,'((126.653563407,37.450238326),(126.65534669,37.450336191),(126.655674616,37.450710678),(126.655737946,37.451354293),(126.65440268,37.45175574),(126.653761682,37.451911747))');
insert into booth.zones values ('five','5호관',37.451108,126.653045,'((126.652067278,37.450388871),(126.653262251,37.450073068),(126.653563407,37.450238326),(126.653761682,37.451911747),(126.65363808,37.45194183),(126.6530797,37.4521045),(126.6528855,37.4521371),(126.6525693,37.452072),(126.652474338,37.452055369))');
insert into booth.zones values ('library','정석학술정보관',37.449348,126.652307,'((126.6504913,37.4488536),(126.6505271,37.4487565),(126.6505808,37.4485626),(126.6507639,37.4484888),(126.6527874,37.4476634),(126.653303301,37.447459832),(126.653575758,37.447979431),(126.653262251,37.450073068),(126.652067278,37.450388871),(126.649694761,37.449784171),(126.6497967,37.4495766),(126.6499295,37.4493095),(126.650006,37.449035),(126.6501274,37.4490101),(126.6502018,37.4490381))');
insert into booth.zones values ('main','본관',37.449546,126.654405,'((126.653262251,37.450073068),(126.653575758,37.447979431),(126.655544615,37.449192984),(126.65534669,37.450336191),(126.653563407,37.450238326))');
insert into booth.zones values ('seoho','서호관',37.451346,126.651499,'((126.652067278,37.450388871),(126.652474338,37.452055369),(126.6524237,37.4520465),(126.6520885,37.4519878),(126.6520048,37.4519731),(126.6517828,37.4519342),(126.6512838,37.4518467),(126.6510982,37.4518266),(126.6505999,37.4517726),(126.6501326,37.45175),(126.6495914,37.4517312),(126.649781,37.4514003),(126.6490067,37.4509487),(126.6493324,37.4504076),(126.6496642,37.4498464),(126.649694761,37.449784171))');
insert into booth.zones values ('student','학생회관',37.449777,126.656522,'((126.655674616,37.450710678),(126.65534669,37.450336191),(126.655544615,37.449192984),(126.656652225,37.448819145),(126.6569217,37.4492734),(126.657426636,37.450094686))');
insert into booth.zones values ('tech','하이테크센터',37.45084,126.657115,'((126.655674616,37.450710678),(126.657426636,37.450094686),(126.6578465,37.4507776),(126.6564271,37.4511471),(126.655737946,37.451354293))');
insert into booth.zones values ('six','6호관',37.448229,126.655693,'((126.655544615,37.449192984),(126.653575758,37.447979431),(126.653303301,37.447459832),(126.653386,37.4474272),(126.6544155,37.4470167),(126.6545294,37.4469713),(126.6547144,37.4468884),(126.6553859,37.4466845),(126.656652225,37.448819145))');
create function booth.zone_at(lat float8,lng float8) returns text language sql stable set search_path='' as $$
 select id from booth.zones where (boundary @> point(lng,lat) or (boundary <-> point(lng,lat)) <= 0.000000001) order by id limit 1
$$;
create table booth.bins(
 id uuid primary key default gen_random_uuid(),zone_id text not null references booth.zones,name text not null,
 location_description text not null,lat float8 not null,lng float8 not null,waste_types booth.waste_list not null,
 source text not null check(source in ('seed','request')),created_at timestamptz not null default now());
create table booth.bin_fill_statuses(
 bin_id uuid references booth.bins not null,waste_type booth.waste not null,fill_percent integer check(fill_percent between 0 and 100),
 updated_at timestamptz not null default now(),source text not null check(source in ('seed','sensor_demo','installation_demo')),primary key(bin_id,waste_type));
create function booth.installed_item() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select from booth.bins where id=new.bin_id and new.waste_type=any(waste_types)) then raise exception 'ITEM'; end if;
 return new;
end $$;
create trigger installed_item before insert or update on booth.bin_fill_statuses for each row execute function booth.installed_item();
create table booth.fill_readings(id uuid primary key default gen_random_uuid(),bin_id uuid not null,waste_type booth.waste not null,
 previous_percent integer check(previous_percent between 0 and 100),fill_percent integer not null check(fill_percent between 0 and 100),
 source text not null check(source in ('sensor_demo','seed')),created_at timestamptz not null default now(),
 foreign key(bin_id,waste_type) references booth.bin_fill_statuses);
create table booth.installation_batches(id uuid primary key default gen_random_uuid(),zone_id text not null references booth.zones,
 request_ids uuid[] not null,full_report_ids uuid[] not null,name text not null,lat float8 not null,lng float8 not null,waste_types booth.waste_list not null,
 status text not null check(status in ('approved','installed')),priority_score_at_approval int not null,installed_bin_id uuid unique references booth.bins,
 approved_at timestamptz not null default now(),installed_at timestamptz);
create table booth.installation_requests(id uuid primary key default gen_random_uuid(), visitor_id uuid not null,zone_id text not null references booth.zones,
 lat float8 not null,lng float8 not null,location_description text not null,requested_waste_types booth.waste_list not null, reason text not null check(length(reason) between 1 and 400),
 status text not null default 'pending' check(status in ('pending','reviewing','approved','installed','rejected')),
 batch_id uuid references booth.installation_batches,installed_bin_id uuid references booth.bins,idempotency_key uuid not null,
 created_at timestamptz not null default now(), approved_at timestamptz, installed_at timestamptz, unique(visitor_id,idempotency_key));
create table booth.full_reports(id uuid primary key default gen_random_uuid(), visitor_id uuid not null,bin_id uuid not null, zone_id text not null references booth.zones,
 waste_type booth.waste not null,lat float8 not null,lng float8 not null,source text not null check(source in ('seed','student_report')),
 considered_batch_id uuid references booth.installation_batches,idempotency_key uuid not null,created_at timestamptz not null default now(),
 foreign key(bin_id,waste_type) references booth.bin_fill_statuses,unique(visitor_id,idempotency_key));
create index report_cooldown on booth.full_reports(visitor_id,bin_id,waste_type,created_at desc);
create table booth.receipts(actor uuid not null, key uuid not null, action text not null, payload jsonb not null, result jsonb not null, primary key(actor,key));
create table booth.login_windows(client text primary key, started_at timestamptz not null, attempts int not null);
create table public.demo_revision(id smallint primary key check(id=1),version bigint not null,epoch uuid not null);
insert into public.demo_revision values(1,0,gen_random_uuid());
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='booth' loop execute format('alter table booth.%I enable row level security',t); end loop;
end $$;
grant select,insert,update,delete on all tables in schema booth to service_role;
alter table public.demo_revision enable row level security;
revoke all on public.demo_revision from public,anon,authenticated;
grant select on public.demo_revision to anon,authenticated;
grant select,update on public.demo_revision to service_role;
create policy revision_signal on public.demo_revision for select to anon,authenticated using(id=1);
alter publication supabase_realtime add table public.demo_revision;
