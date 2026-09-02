\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled temporary SQL bundle.'
    \quit 3
\endif

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

do $install$
begin
    if pg_catalog.to_regprocedure(
        'delivery.get_label_access_context(text,text)'
    ) is null then
        raise exception 'label access: fresh install and reapply omitted context RPC';
    end if;
    if pg_catalog.to_regprocedure(
        'delivery.get_label_access_context(text,text,timestamp with time zone)'
    ) is not null then
        raise exception 'label access: reapply retained legacy clock input';
    end if;
end;
$install$;
