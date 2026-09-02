alter table forms.forms enable row level security;
alter table forms.forms force row level security;
alter table forms.form_versions enable row level security;
alter table forms.form_versions force row level security;
alter table forms.submissions enable row level security;
alter table forms.submissions force row level security;
alter table forms.media enable row level security;
alter table forms.media force row level security;
alter table forms.form_draft_media enable row level security;
alter table forms.form_draft_media force row level security;
alter table forms.form_version_media enable row level security;
alter table forms.form_version_media force row level security;

revoke all on schema forms from public, anon, authenticated, service_role;
revoke all on all tables in schema forms from public, anon, authenticated, service_role;
revoke all on all sequences in schema forms from public, anon, authenticated, service_role;
revoke all on all functions in schema forms from public, anon, authenticated, service_role;

grant usage on schema forms to service_role;

grant execute on function forms.get_published_form(text, integer, text) to service_role;
grant execute on function forms.get_managed_form(text) to service_role;
grant execute on function forms.list_managed_forms(text, text, integer, integer) to service_role;
grant execute on function forms.save_form_draft(text, text, text, text, jsonb, text) to service_role;
grant execute on function forms.publish_form(text, text) to service_role;
grant execute on function forms.archive_form(text, text) to service_role;
grant execute on function forms.list_submissions(text, text, integer, integer) to service_role;
grant execute on function forms.get_submission(bigint) to service_role;
grant execute on function forms.submit_form(text, integer, text, uuid, jsonb, text, jsonb) to service_role;
grant execute on function forms.update_submission_status(bigint, text, text) to service_role;
grant execute on function forms.purge_expired_submissions(integer, integer) to service_role;
grant execute on function forms.create_media(text, text, text, text, bigint, integer, integer, text, text)
    to service_role;
grant execute on function forms.get_managed_media_context(bigint) to service_role;
grant execute on function forms.get_published_media_context(text, integer, bigint, text) to service_role;

alter default privileges in schema forms
revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema forms
revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema forms
revoke execute on functions from public, anon, authenticated, service_role;

comment on schema forms is 'Private versioned forms and submissions exposed only through the CMS connector.';
comment on table forms.form_versions is 'Immutable snapshots; existing rows are never updated or deleted.';
comment on table forms.submissions is 'Idempotent submission records tied to an exact published form version.';
comment on table forms.media is 'Immutable private originals owned by one form.';
comment on table forms.form_version_media is 'Immutable media reachability for an exact published form version.';
