create or replace function booth.restore_seed() returns void language plpgsql set search_path=booth,pg_temp as $$
declare z booth.zones; b uuid; n integer:=0; item booth.waste; accepts booth.waste[]; p integer; i int; label text;
begin
 delete from receipts where actor is not null; delete from full_reports where source in ('seed','student_report'); delete from installation_requests where status in ('pending','reviewing','approved','installed','rejected'); delete from installation_batches where status in ('approved','installed');
 delete from fill_readings where source in ('seed','sensor_demo'); delete from bin_fill_statuses where source in ('seed','sensor_demo','installation_demo'); delete from bins where source in ('seed','request');
 for z in select * from zones order by id loop
  n:=n+1;
  accepts:=case z.id when 'five' then array['liquid'] when 'library' then array['paper'] when 'seoho' then array['plastic'] when 'tech' then array['can']
    when 'six' then array['general'] when 'main' then array['glass'] when 'student' then array['general','plastic','liquid','can'] else array['paper','glass','plastic'] end;
  label:=case z.id when 'five' then '남은 음료 수거함' when 'library' then '종이 수거함' when 'student' then '중앙 분리수거대' when 'anniversary' then '종합 분리수거대' else '출입구 수거함' end;
  b:=('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into bins(id,zone_id,name,location_description,lat,lng,waste_types,source) values(b,z.id,z.name||' '||label,'건물 출입구 옆 보행로',z.lat,z.lng,accepts,'seed');
  foreach item in array accepts loop
   p:=case when z.id='five' then 42 when z.id='library' then 83 when z.id='seoho' then null when item='glass' then 100 else (n*13+array_position(accepts,item)*11)%80 end;
   insert into bin_fill_statuses(bin_id,waste_type,fill_percent,source) values(b,item,p,'seed');
   for i in 0..6 loop
    insert into fill_readings(bin_id,waste_type,previous_percent,fill_percent,created_at,source)
    values(b,item,case when i=6 then null else (n*7+(i+1)*17)%101 end,case when i=0 then coalesce(p,35) else (n*7+i*17)%101 end,now()-i*interval '1 day'-interval '12 minutes','seed');
   end loop;
  end loop;
  for i in 1..(case z.id when 'five' then 2 when 'library' then 1 when 'student' then 1 else 0 end) loop
   insert into installation_requests(visitor_id,zone_id,lat,lng,location_description,requested_waste_types,reason,idempotency_key,created_at)
   values(gen_random_uuid(),z.id,z.lat+i*.000035,z.lng-i*.000045,'가상 보행로',accepts,'수업이 끝나면 이곳에 배출할 곳이 부족해요.',gen_random_uuid(),now()-i*interval '2 hours');
  end loop;
  for i in 1..(case z.id when 'student' then 4 when 'tech' then 2 when 'library' then 1 else 0 end) loop
   insert into full_reports(visitor_id,bin_id,zone_id,waste_type,lat,lng,source,idempotency_key,created_at)
   values(gen_random_uuid(),b,z.id,accepts[1+(i-1)%cardinality(accepts)],z.lat,z.lng,'seed',gen_random_uuid(),now()-(i-1)*interval '1 day'-interval '5 minutes');
  end loop;
 end loop;
end $$;
revoke all on function booth.restore_seed() from public,anon,authenticated;
grant execute on function booth.restore_seed() to service_role;
