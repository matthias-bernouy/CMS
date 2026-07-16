\set ON_ERROR_STOP on

begin;
set local role service_role;

select commerce.upsert_workflow_state(
    'quality_check', 'Quality check', 'admin_review', 55, true, false
);

select commerce.upsert_workflow_transition(
    'pending_review', 'request_quality_check', 'admin', 'quality_check'
);

do $$
begin
    if not exists (
        select 1 from commerce.offer_workflow_transitions
        where from_state = 'pending_review'
          and action = 'request_quality_check'
          and actor_kind = 'admin'
          and to_state = 'quality_check'
    ) then raise exception 'smoke: custom administrator transition was not stored'; end if;

    begin
        perform commerce.upsert_workflow_transition(
            'draft', 'seller_custom', 'seller', 'quality_check'
        );
        raise exception 'smoke: inert custom seller transition was accepted';
    exception when others then
        if sqlerrm = 'smoke: inert custom seller transition was accepted'
            or sqlerrm <> 'conflict: custom seller transitions are not executable' then
            raise;
        end if;
    end;

    begin
        perform commerce.upsert_workflow_state(
            'approved', 'Approved', 'draft', 60, true, false
        );
        raise exception 'smoke: reserved state behavior was changed';
    exception when others then
        if sqlerrm = 'smoke: reserved state behavior was changed'
            or sqlerrm <> 'conflict: reserved workflow state behavior is immutable' then
            raise;
        end if;
    end;
end;
$$;

rollback;
