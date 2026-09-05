

create table if not exists stripe_connect.provider_exceptions (
    id bigint generated always as identity primary key,
    deduplication_key text,
    payment_id bigint references stripe_connect.payments(id) on delete restrict,
    operation_id bigint references stripe_connect.financial_operations(id) on delete restrict,
    exception_type text not null,
    severity text not null default 'high',
    status text not null default 'open',
    message text not null,
    details jsonb not null default '{}'::jsonb,
    detected_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by text,
    constraint provider_exceptions_type_not_blank check (length(btrim(exception_type)) > 0),
    constraint provider_exceptions_severity_valid check (severity in ('medium', 'high', 'critical')),
    constraint provider_exceptions_status_valid check (status in ('open', 'investigating', 'resolved')),
    constraint provider_exceptions_message_not_blank check (length(btrim(message)) > 0),
    constraint provider_exceptions_details_object check (jsonb_typeof(details) = 'object')
);

alter table stripe_connect.provider_exceptions
    add column if not exists deduplication_key text;

do $$
begin
    if exists (
        select 1
        from pg_catalog.pg_index index_definition
        join pg_catalog.pg_class index_relation on index_relation.oid = index_definition.indexrelid
        join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
        where index_namespace.nspname = 'stripe_connect'
          and index_relation.relname = 'provider_exceptions_deduplication_key_idx'
          and index_definition.indpred is not null
    ) then
        drop index stripe_connect.provider_exceptions_deduplication_key_idx;
    end if;
end;
$$;

create unique index if not exists provider_exceptions_deduplication_key_idx
    on stripe_connect.provider_exceptions(deduplication_key);
