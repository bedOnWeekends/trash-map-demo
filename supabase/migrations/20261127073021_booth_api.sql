create function booth.week_start() returns timestamptz language sql stable set search_path='' as $$
 select (((now() at time zone 'Asia/Seoul')::date - 6)::timestamp at time zone 'Asia/Seoul')
$$;
create function public.booth_snapshot(actor uuid, admin_view boolean) returns jsonb language sql stable set search_path=booth,pg_temp as $$
 select jsonb_build_object(
 'version',rev.version,'epoch',rev.epoch,'as_of',now(),
 'bins',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('fills',(select jsonb_object_agg(s.waste_type,s.fill_percent) from bin_fill_statuses s where s.bin_id=b.id)) order by b.created_at,b.name) from bins b),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)-'visitor_id'-'idempotency_key' order by r.created_at desc) from installation_requests r where admin_view or r.visitor_id=actor),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(f)-'visitor_id'-'idempotency_key' order by f.created_at desc) from full_reports f where admin_view and f.created_at>=week_start()),'[]'),
 'readings',coalesce((select jsonb_agg(jsonb_build_object('previous_percent',previous_percent,'fill_percent',fill_percent,'created_at',created_at)) from fill_readings where admin_view and created_at>=week_start()),'[]'),
 'batches',coalesce((select jsonb_agg(to_jsonb(b) order by approved_at desc) from installation_batches b where admin_view),'[]'))
 from public.demo_revision rev where id=1
$$;
create function public.booth_login_attempt(client_key text) returns boolean language plpgsql set search_path=booth,pg_temp as $$
declare attempts_now int;
begin
 delete from login_windows where started_at<now()-interval '15 minutes';
 insert into login_windows values(client_key,now(),1)
 on conflict(client) do update set attempts=login_windows.attempts+1 returning attempts into attempts_now;
 return attempts_now<=8;
end $$;
create function public.booth_mutate(actor uuid, action text, generation uuid, key uuid, payload jsonb) returns jsonb
language plpgsql set search_path=booth,pg_temp as $$
declare rev public.demo_revision; receipt receipts; bin bins; batch installation_batches;
 result_id uuid; point_lat float8:=(payload->>'lat')::float8; point_lng float8:=(payload->>'lng')::float8;
 zid text; types booth.waste[]; item booth.waste:=(payload->>'item')::booth.waste; old_percent int; pct int; target uuid:=(payload->>'id')::uuid;
 reqs uuid[]; reps uuid[]; changed int; score int; result jsonb; cool_until timestamptz; title text:=trim(payload->>'name');
begin
 select * into strict rev from public.demo_revision where id=1 for update;
 if generation is distinct from rev.epoch then raise exception 'EPOCH'; end if;
 if actor is null or key is null then raise exception 'INVALID'; end if;
 select * into receipt from receipts r where r.actor=booth_mutate.actor and r.key=booth_mutate.key;
 if found then
  if receipt.action<>action or receipt.payload<>payload then raise exception 'CONFLICT'; end if;
  return receipt.result;
 end if;
 if action in ('request','approve') then
  zid:=zone_at(point_lat,point_lng);
  if zid is null or (action='approve' and zid is distinct from payload->>'zone') then raise exception 'ZONE'; end if;
  types:=array(select distinct v::booth.waste from jsonb_array_elements_text(payload->'types') v order by 1);
  if cardinality(types)=0 then raise exception 'ITEM'; end if;
 end if;
 case action
 when 'request' then
  insert into installation_requests(visitor_id,zone_id,lat,lng,location_description,requested_waste_types,reason,idempotency_key)
  values(actor,zid,point_lat,point_lng,(select name from zones where id=zid),types,trim(payload->>'reason'),key) returning id into result_id;
 when 'report' then
  select * into bin from bins where id=target;
  if not found or item is null or not item=any(bin.waste_types) then raise exception 'ITEM'; end if;
  select max(created_at)+interval '10 minutes' into cool_until from full_reports where visitor_id=actor and bin_id=target and waste_type=item;
  if cool_until>clock_timestamp() then raise exception 'COOLDOWN' using detail=cool_until::text; end if;
  insert into full_reports(visitor_id,bin_id,zone_id,waste_type,lat,lng,source,idempotency_key)
  values(actor,target,bin.zone_id,item,bin.lat,bin.lng,'student_report',key) returning id into result_id;
 when 'sensor' then
  pct:=(payload->>'percent')::int;
  select fill_percent into old_percent from bin_fill_statuses where bin_id=target and waste_type=item;
  if not found then raise exception 'ITEM'; end if;
  update bin_fill_statuses set fill_percent=pct,source='sensor_demo',updated_at=now() where bin_id=target and waste_type=item;
  insert into fill_readings(bin_id,waste_type,previous_percent,fill_percent,source) values(target,item,old_percent,pct,'sensor_demo') returning id into result_id;
 when 'review','reject' then
  update installation_requests set status=case action when 'review' then 'reviewing' else 'rejected' end
   where id=target and (status='pending' or (action='reject' and status='reviewing')) returning id into result_id;
  if not found then raise exception 'CONFLICT'; end if;
 when 'approve' then
  reqs:=array(select distinct v::uuid from jsonb_array_elements_text(payload->'requestIds') v);
  reps:=array(select distinct v::uuid from jsonb_array_elements_text(payload->'reportIds') v);
  if cardinality(reqs)+cardinality(reps)=0 or length(title) not between 1 and 60 then raise exception 'INVALID'; end if;
  select 3*(select count(*) from installation_requests where zone_id=zid and status in ('pending','reviewing'))+
   (select count(*) from full_reports where zone_id=zid and considered_batch_id is null and created_at>=week_start()) into score;
  insert into installation_batches(zone_id,request_ids,full_report_ids,name,lat,lng,waste_types,status,priority_score_at_approval)
  values(zid,reqs,reps,title,point_lat,point_lng,types,'approved',score) returning id into result_id;
  update installation_requests set batch_id=result_id,status='approved',approved_at=now() where id=any(reqs) and zone_id=zid and status in ('pending','reviewing');
  get diagnostics changed=row_count;
  if changed<>cardinality(reqs) then raise exception 'CONFLICT'; end if;
  update full_reports set considered_batch_id=result_id where id=any(reps) and zone_id=zid and created_at>=week_start() and considered_batch_id is null;
  get diagnostics changed=row_count;
  if changed<>cardinality(reps) then raise exception 'CONFLICT'; end if;
 when 'install' then
  select * into batch from installation_batches where id=target;
  if not found then raise exception 'CONFLICT'; end if;
  if batch.status='installed' then return jsonb_build_object('id',batch.installed_bin_id); end if;
  insert into bins(zone_id,name,location_description,lat,lng,waste_types,source) values(batch.zone_id,batch.name,'관리자가 지정한 데모 설치 위치',batch.lat,batch.lng,batch.waste_types,'request') returning id into result_id;
  insert into bin_fill_statuses(bin_id,waste_type,fill_percent,source) select result_id,t,0,'installation_demo' from unnest(batch.waste_types)t;
  update installation_batches set status='installed',installed_bin_id=result_id,installed_at=now() where id=target;
  update installation_requests set status='installed',installed_bin_id=result_id,installed_at=now() where batch_id=target;
 when 'reset' then
  perform restore_seed();
 else raise exception 'INVALID';
 end case;
 update public.demo_revision set version=version+1,epoch=case when action='reset' then gen_random_uuid() else epoch end where id=1 returning * into rev;
 result:=jsonb_build_object('id',result_id,'version',rev.version,'epoch',rev.epoch);
 insert into receipts values(actor,key,action,payload,result);
 return result;
end $$;
revoke all on all functions in schema booth from public,anon,authenticated;
grant execute on all functions in schema booth to service_role;
revoke all on function public.booth_snapshot(uuid,boolean), public.booth_login_attempt(text), public.booth_mutate(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.booth_snapshot(uuid,boolean), public.booth_login_attempt(text), public.booth_mutate(uuid,text,uuid,uuid,jsonb) to service_role;
