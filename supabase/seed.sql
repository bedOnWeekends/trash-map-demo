-- First provisioning only. Re-running this script cannot erase booth activity.
do $$ begin
 perform 1 from public.demo_revision where id=1 for update;
 if (select version from public.demo_revision where id=1)=0 then
  perform booth.restore_seed();
  update public.demo_revision set version=version+1 where id=1;
 end if;
end $$;
