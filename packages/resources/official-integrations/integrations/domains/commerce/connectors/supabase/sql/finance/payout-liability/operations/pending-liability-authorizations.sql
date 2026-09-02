

create or replace function commerce.pending_platform_payout_liability_authorizations(
    p_run_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control jsonb;
    v_required bigint;
    v_applied bigint;
    v_authorization_id text;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 then
        raise exception 'validation: platform payout liability run key is required';
    end if;
    v_control := commerce.refresh_platform_payout_liability(
        'Scheduled liability and terminal risk-window refresh: ' || p_run_key, null
    );
    v_required := (v_control->>'requiredMinimumAmount')::bigint;
    v_applied := (v_control->>'lastProviderAppliedAmount')::bigint;
    v_authorization_id := v_control->>'decreaseAuthorizationId';
    return jsonb_build_object(
        'runKey', p_run_key,
        'control', v_control,
        'authorizations', case
            when v_required > v_applied
                or (v_required < v_applied and v_authorization_id is not null)
            then jsonb_build_array(jsonb_build_object(
                'liabilityRevision', (v_control->>'liabilityRevision')::bigint,
                'requiredMinimumAmount', v_required,
                'decreaseAuthorizationId', v_authorization_id,
                'changeDirection', v_control->>'changeDirection'
            ))
            else '[]'::jsonb
        end
    );
end;
$$;