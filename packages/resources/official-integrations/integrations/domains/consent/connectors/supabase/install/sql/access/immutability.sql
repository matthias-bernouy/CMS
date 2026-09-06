create or replace function consent.reject_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    raise exception 'conflict: consent evidence is immutable';
end;
$$;

drop trigger if exists consent_document_versions_immutable
    on consent.document_versions;
create trigger consent_document_versions_immutable
before update or delete on consent.document_versions
for each row execute function consent.reject_evidence_mutation();

drop trigger if exists consent_acceptance_intents_immutable
    on consent.acceptance_intents;
create trigger consent_acceptance_intents_immutable
before update on consent.acceptance_intents
for each row execute function consent.reject_evidence_mutation();

drop trigger if exists consent_acceptance_intent_documents_immutable
    on consent.acceptance_intent_documents;
create trigger consent_acceptance_intent_documents_immutable
before update on consent.acceptance_intent_documents
for each row execute function consent.reject_evidence_mutation();

drop trigger if exists consent_acceptances_immutable
    on consent.acceptances;
create trigger consent_acceptances_immutable
before update or delete on consent.acceptances
for each row execute function consent.reject_evidence_mutation();

drop trigger if exists consent_acceptance_documents_immutable
    on consent.acceptance_documents;
create trigger consent_acceptance_documents_immutable
before update or delete on consent.acceptance_documents
for each row execute function consent.reject_evidence_mutation();

drop trigger if exists consent_operation_acceptances_immutable
    on consent.operation_acceptances;
create trigger consent_operation_acceptances_immutable
before update or delete on consent.operation_acceptances
for each row execute function consent.reject_evidence_mutation();
