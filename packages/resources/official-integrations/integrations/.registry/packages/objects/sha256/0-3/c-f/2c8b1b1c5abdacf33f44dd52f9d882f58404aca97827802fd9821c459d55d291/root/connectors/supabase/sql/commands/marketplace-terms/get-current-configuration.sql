
create or replace function stripe_connect.get_current_marketplace_terms_configuration()
returns jsonb
language sql
stable
set search_path = ''
as $$
    select case
        when configuration.current_terms_version_id is not null then jsonb_build_object(
            'mode', 'published_page',
            'version', version.terms_version,
            'hash', version.content_hash,
            'documentKey', version.document_key,
            'label', version.label,
            'consentText', version.consent_text,
            'page', version.page_snapshot,
            'publishedSnapshotUrl', version.published_snapshot_url,
            'updatedAt', configuration.updated_at
        )
        else jsonb_build_object(
            'mode', 'legacy',
            'version', configuration.legacy_terms_version,
            'hash', configuration.legacy_terms_hash,
            'updatedAt', configuration.updated_at
        )
    end
    from stripe_connect.marketplace_terms_configuration configuration
    left join stripe_connect.marketplace_terms_versions version
      on version.id = configuration.current_terms_version_id
    where configuration.singleton;
$$;
