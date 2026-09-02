drop function if exists sales_configurator.save_partner_proposal_draft(
    text,
    bigint,
    bigint,
    jsonb,
    jsonb,
    jsonb
);
drop function if exists sales_configurator.read_partner_proposal(text, bigint);
drop function if exists sales_configurator.publish_partner_proposal(
    text,
    bigint,
    bigint,
    bigint
);
drop function if exists sales_configurator.create_partner_proposal_share(
    text,
    bigint,
    timestamptz,
    text
);
drop function if exists sales_configurator.revoke_partner_proposal_share(
    text,
    bigint,
    bigint
);
drop function if exists sales_configurator.prepare_partner_proposal_draft(
    text,
    bigint,
    bigint,
    jsonb
);
drop function if exists sales_configurator.partner_proposal_json(bigint, text);
drop function if exists sales_configurator.save_partner_client(text, bigint, jsonb);
drop function if exists sales_configurator.protect_owner_cms_user_id();
