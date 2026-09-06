alter table consent.contexts enable row level security;
alter table consent.contexts force row level security;
alter table consent.documents enable row level security;
alter table consent.documents force row level security;
alter table consent.document_versions enable row level security;
alter table consent.document_versions force row level security;
alter table consent.acceptance_intents enable row level security;
alter table consent.acceptance_intents force row level security;
alter table consent.acceptance_intent_documents enable row level security;
alter table consent.acceptance_intent_documents force row level security;
alter table consent.acceptances enable row level security;
alter table consent.acceptances force row level security;
alter table consent.acceptance_documents enable row level security;
alter table consent.acceptance_documents force row level security;

revoke all on all tables in schema consent from public;
revoke all on all tables in schema consent from anon;
revoke all on all tables in schema consent from authenticated;
revoke all on all functions in schema consent from public;
revoke all on all functions in schema consent from anon;
revoke all on all functions in schema consent from authenticated;
revoke all on all sequences in schema consent from public;
revoke all on all sequences in schema consent from anon;
revoke all on all sequences in schema consent from authenticated;
revoke all on all tables in schema consent from service_role;
revoke all on all functions in schema consent from service_role;
revoke all on all sequences in schema consent from service_role;

grant usage on schema consent to service_role;
grant select, insert, update on consent.contexts, consent.documents to service_role;
grant select, insert on consent.document_versions to service_role;
grant select, insert, update, delete on consent.acceptance_intents to service_role;
grant select, insert on consent.acceptance_intent_documents to service_role;
grant select, insert on consent.acceptances, consent.acceptance_documents, consent.operation_acceptances to service_role;
grant usage, select on all sequences in schema consent to service_role;
grant execute on all functions in schema consent to service_role;

alter default privileges in schema consent revoke execute on functions from public;
alter default privileges in schema consent revoke all on tables from public;
alter default privileges in schema consent revoke all on sequences from public;
alter default privileges in schema consent revoke all on tables from service_role;
alter default privileges in schema consent revoke all on sequences from service_role;
alter default privileges in schema consent revoke execute on functions from service_role;

comment on table consent.document_versions is
    'Immutable CMS page and wording snapshots used by consent evidence.';
comment on table consent.acceptance_intents is
    'Short-lived explicit consent claims awaiting association with a CMS subject.';
comment on table consent.acceptances is
    'Immutable consent receipts associated with a verified CMS subject.';
