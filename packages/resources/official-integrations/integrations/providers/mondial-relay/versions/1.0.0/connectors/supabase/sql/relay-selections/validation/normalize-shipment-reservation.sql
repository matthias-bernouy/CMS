

create or replace function delivery.normalize_shipment_reservation(
    p_candidate delivery.shipments,
    p_check jsonb,
    p_reservation jsonb
)
returns delivery.shipments
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
    if not p_reservation ? 'sender_email' then
        p_candidate.sender_email := nullif(pg_catalog.btrim(coalesce(p_check->'sender'->>'email', '')), '');
    end if;
    if not p_reservation ? 'sender_phone' then
        p_candidate.sender_phone := nullif(coalesce(
            nullif(pg_catalog.btrim(coalesce(p_check->'sender'->>'phone', '')), ''),
            pg_catalog.btrim(coalesce(p_check->'sender'->>'mobile', ''))
        ), '');
    end if;
    if not p_reservation ? 'sender_address_line2' then
        p_candidate.sender_address_line2 := nullif(
            pg_catalog.btrim(coalesce(p_check->'sender'->>'addressLine2', '')), ''
        );
    end if;
    if not p_reservation ? 'sender_address_line3' then
        p_candidate.sender_address_line3 := nullif(
            pg_catalog.btrim(coalesce(p_check->'sender'->>'addressLine3', '')), ''
        );
    end if;
    if not p_reservation ? 'recipient_email' then
        p_candidate.recipient_email := nullif(pg_catalog.btrim(coalesce(p_check->'recipient'->>'email', '')), '');
    end if;
    if not p_reservation ? 'recipient_phone' then
        p_candidate.recipient_phone := nullif(coalesce(
            nullif(pg_catalog.btrim(coalesce(p_check->'recipient'->>'phone', '')), ''),
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'mobile', ''))
        ), '');
    end if;
    if not p_reservation ? 'recipient_address_line2' then
        p_candidate.recipient_address_line2 := nullif(
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'addressLine2', '')), ''
        );
    end if;
    if not p_reservation ? 'recipient_address_line3' then
        p_candidate.recipient_address_line3 := nullif(
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'addressLine3', '')), ''
        );
    end if;
    return p_candidate;
end;
$$;