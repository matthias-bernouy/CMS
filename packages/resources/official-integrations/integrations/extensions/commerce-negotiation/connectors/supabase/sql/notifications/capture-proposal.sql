-- The extension owns negotiation events; Commerce owns delivery and templates.
create or replace function commerce_negotiation.capture_proposal_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
    v_type text;
    v_types text[] := '{}';
    v_context jsonb;
    v_role text;
    v_recipient text;
begin
    select * into strict v_proposal from commerce_negotiation.proposals where id = new.proposal_id;
    v_types := case new.event_type
        when 'created' then array['commerce.seller.proposal.received']
        when 'rejected' then array['commerce.buyer.proposal.rejected']
        when 'withdrawn' then array['commerce.seller.proposal.withdrawn']
        when 'superseded' then array['commerce.buyer.proposal.superseded']
        when 'expired' then array['commerce.buyer.proposal.expired', 'commerce.seller.proposal.expired']
        when 'canceled' then array['commerce.buyer.proposal.canceled', 'commerce.seller.proposal.canceled']
        -- Acceptance already queues commerce.price_agreement.accepted for the buyer.
        else '{}'::text[]
    end;
    foreach v_type in array v_types loop
        v_role := split_part(v_type, '.', 2);
        v_recipient := case v_role
            when 'buyer' then v_proposal.buyer_cms_user_id
            else v_proposal.seller_cms_user_id
        end;
        v_context := jsonb_build_object(
            'offer', jsonb_build_object(
                'id', v_proposal.commerce_offer_id,
                'slug', v_proposal.commerce_offer_slug,
                'title', v_proposal.commerce_offer_title
            ),
            'proposal', jsonb_build_object(
                'id', v_proposal.public_id,
                'status', new.next_status,
                'previousStatus', new.previous_status,
                'amountMinor', v_proposal.proposed_amount,
                'amountFormatted', (v_proposal.proposed_amount::numeric / 100)::numeric(20, 2)::text
                    || ' ' || upper(v_proposal.currency),
                'currency', upper(v_proposal.currency)
            ),
            'action', jsonb_build_object(
                'path', '/account/negotiations?audience=' || v_role || '&proposalId=' || v_proposal.public_id::text
            )
        );
        perform commerce.enqueue_marketplace_notification(
            v_type, new.id, 'proposal', v_proposal.id, new.created_at, v_context, array[v_recipient]
        );
    end loop;
    return new;
end;
$$;

drop trigger if exists commerce_negotiation_capture_proposal_notification on commerce_negotiation.proposal_events;
create trigger commerce_negotiation_capture_proposal_notification
after insert on commerce_negotiation.proposal_events
for each row execute function commerce_negotiation.capture_proposal_notification();
