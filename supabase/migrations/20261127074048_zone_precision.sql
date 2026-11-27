-- PostgreSQL geometric operators use a fixed tolerance. Normalize tiny degree
-- differences into local microdegrees before testing boundaries and distances.
create or replace function booth.zone_at(lat float8,lng float8) returns text language sql stable set search_path='' as $$
 with shapes as (
  select id,((boundary::path-point(126.65,37.45))*point(1000000,0))::polygon as ring,
         (point($2,$1)-point(126.65,37.45))*point(1000000,0) as p
  from booth.zones
 )
 select id from shapes where ring @> p or (ring <-> p)<=0.001 order by id limit 1
$$;
