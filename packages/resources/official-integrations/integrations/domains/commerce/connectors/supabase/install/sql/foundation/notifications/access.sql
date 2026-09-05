alter table commerce.notification_configuration enable row level security;
alter table commerce.notification_configuration force row level security;
alter table commerce.notification_rules enable row level security;
alter table commerce.notification_rules force row level security;
alter table commerce.notification_user_preferences enable row level security;
alter table commerce.notification_user_preferences force row level security;
alter table commerce.notification_events enable row level security;
alter table commerce.notification_events force row level security;
alter table commerce.notification_deliveries enable row level security;
alter table commerce.notification_deliveries force row level security;

revoke all on commerce.notification_configuration from public, anon, authenticated;
revoke all on commerce.notification_rules from public, anon, authenticated;
revoke all on commerce.notification_user_preferences from public, anon, authenticated;
revoke all on commerce.notification_events from public, anon, authenticated;
revoke all on commerce.notification_deliveries from public, anon, authenticated;
revoke execute on function commerce.claim_notifications(text, integer, text)
    from public, anon, authenticated;
revoke execute on function commerce.complete_notification(uuid, text, text)
    from public, anon, authenticated;
revoke execute on function commerce.fail_notification(uuid, text, text, boolean)
    from public, anon, authenticated;

grant usage on schema commerce to service_role;
grant select, insert, update on
    commerce.notification_configuration,
    commerce.notification_rules,
    commerce.notification_user_preferences,
    commerce.notification_events,
    commerce.notification_deliveries
to service_role;
grant usage, select on sequence commerce.notification_events_id_seq to service_role;
grant execute on function commerce.claim_notifications(text, integer, text) to service_role;
grant execute on function commerce.complete_notification(uuid, text, text) to service_role;
grant execute on function commerce.fail_notification(uuid, text, text, boolean) to service_role;

comment on table commerce.notification_events is
    'Immutable versioned notification events captured from normalized Commerce audit events.';
comment on table commerce.notification_deliveries is
    'Replaceable single-consumer email queue with bounded retries and visible terminal failures.';
comment on table commerce.notification_user_preferences is
    'Per-CMS-user overrides for optional Commerce notifications; email addresses are not stored.';
