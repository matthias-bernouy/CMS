\ir ../../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql
\ir ../../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql

do $install$
begin
    if pg_catalog.to_regprocedure(
        'delivery.get_label_access_context(text,text,timestamp with time zone)'
    ) is null then
        raise exception 'label access: fresh install and reapply omitted context RPC';
    end if;
end;
$install$;
