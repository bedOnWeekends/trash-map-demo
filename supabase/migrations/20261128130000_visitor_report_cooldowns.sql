create or replace function public.booth_snapshot(actor uuid, admin_view boolean) returns jsonb language sql stable set search_path=booth,pg_temp as $$
 select jsonb_build_object(
 'version',rev.version,'epoch',rev.epoch,'as_of',now(),
 'bins',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('fills',(select jsonb_object_agg(s.waste_type,s.fill_percent) from bin_fill_statuses s where s.bin_id=b.id)) order by b.created_at,b.name) from bins b),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)-'visitor_id'-'idempotency_key' order by r.created_at desc) from installation_requests r where admin_view or r.visitor_id=actor),'[]'),
 'report_cooldowns',coalesce((
   select jsonb_agg(to_jsonb(limited)) from (
     select bin_id, waste_type, max(created_at) + interval '10 minutes' as retry_at
     from full_reports
     where not admin_view and visitor_id = actor and created_at > now() - interval '10 minutes'
     group by bin_id, waste_type
   ) limited
 ),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(f)-'visitor_id'-'idempotency_key' order by f.created_at desc) from full_reports f where admin_view and f.created_at>=week_start()),'[]'),
 'readings',coalesce((select jsonb_agg(jsonb_build_object('previous_percent',previous_percent,'fill_percent',fill_percent,'created_at',created_at)) from fill_readings where admin_view and created_at>=week_start()),'[]'),
 'batches',coalesce((select jsonb_agg(to_jsonb(b) order by approved_at desc) from installation_batches b where admin_view),'[]'))
 from public.demo_revision rev where id=1
$$;
