
create unique index if not exists proposal_versions_one_draft_idx
    on sales_configurator.proposal_versions(proposal_id)
    where state = 'draft';

create unique index if not exists proposal_versions_one_published_idx
    on sales_configurator.proposal_versions(proposal_id)
    where state = 'published';

create index if not exists proposal_versions_proposal_created_idx
    on sales_configurator.proposal_versions(proposal_id, version_number desc);

drop trigger if exists proposals_set_updated_at on sales_configurator.proposals;
create trigger proposals_set_updated_at
before update on sales_configurator.proposals
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists proposal_versions_set_updated_at
    on sales_configurator.proposal_versions;
create trigger proposal_versions_set_updated_at
before update on sales_configurator.proposal_versions
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists protect_proposal_owner_cms_user_id
    on sales_configurator.proposals;
drop trigger if exists protect_proposal_partner_account_id
    on sales_configurator.proposals;
create trigger protect_proposal_partner_account_id
before update of partner_account_id on sales_configurator.proposals
for each row execute function sales_configurator.protect_partner_account_id();
