create or replace function commerce.capture_offer_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_recipient text;
    v_type text;
    v_types text[] := '{}';
    v_ready boolean;
    v_was_ready boolean;
    v_context jsonb;
begin
    select * into strict v_offer from commerce.offers where id = new.offer_id;
    select cms_user_id into v_recipient from commerce.sellers where id = v_offer.seller_id;
    select exists(select 1 from commerce.offer_workflow_states
        where code = new.next_workflow_state and phase = 'ready') into v_ready;
    select exists(select 1 from commerce.offer_workflow_states
        where code = new.previous_workflow_state and phase = 'ready') into v_was_ready;
    v_type := case new.event_type
        when 'submitted' then 'commerce.admin.offer.submitted'
        when 'price_submitted' then 'commerce.admin.offer.price_submitted'
        when 'request_price' then 'commerce.seller.offer.price_requested'
        when 'request_changes' then 'commerce.seller.offer.changes_requested'
        when 'reject' then 'commerce.seller.offer.rejected'
        else null
    end;
    if v_type is not null then
        v_types := array_append(v_types, v_type);
    end if;
    -- Publishing an already approved offer must not repeat its approval email.
    if v_ready and not v_was_ready then
        v_types := array_append(v_types, 'commerce.seller.offer.approved');
    end if;
    foreach v_type in array v_types loop
        v_context := jsonb_build_object(
            'offer', jsonb_build_object('id', v_offer.id, 'slug', v_offer.slug, 'title', v_offer.title),
            'action', jsonb_build_object('path', case
                when v_type like 'commerce.admin.%' then '/.cms/admin'
                else '/account/offers?offerId=' || v_offer.id::text
            end)
        );
        perform commerce.enqueue_marketplace_notification(
            v_type, new.id, 'offer', v_offer.id, new.created_at, v_context, array[v_recipient]
        );
    end loop;
    return new;
end;
$$;

revoke execute on function commerce.capture_offer_notification() from public, anon, authenticated;
grant execute on function commerce.capture_offer_notification() to service_role;
drop trigger if exists commerce_capture_offer_notification on commerce.offer_events;
create trigger commerce_capture_offer_notification
after insert on commerce.offer_events
for each row execute function commerce.capture_offer_notification();
