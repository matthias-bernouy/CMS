
create index if not exists stripe_dispute_evidence_dispute_idx
    on stripe_connect.stripe_dispute_evidence(dispute_id);
create index if not exists stripe_dispute_evidence_submitted_operation_idx
    on stripe_connect.stripe_dispute_evidence(submitted_operation_id);