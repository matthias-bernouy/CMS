create or replace function stripe_connect.sync_marketplace_terms_configuration(
    p_document jsonb,
    p_legacy_version text,
    p_legacy_hash text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_actor text := btrim(coalesce(p_actor_id, ''));
    v_terms_version text;
    v_document_key text;
    v_label text;
    v_consent_text text;
    v_page jsonb;
    v_page_id text;
    v_page_path text;
    v_page_title text;
    v_page_description text;
    v_page_content text;
    v_snapshot_url text;
    v_content_hash text;
    v_revision_hash text;
    v_version stripe_connect.marketplace_terms_versions%rowtype;
    v_legacy_version text := btrim(coalesce(p_legacy_version, ''));
    v_legacy_hash text := lower(btrim(coalesce(p_legacy_hash, '')));
begin
    if length(v_actor) < 1 or length(v_actor) > 200 then
        raise exception 'validation: marketplace terms actor is invalid';
    end if;

    if p_document is not null then
        if jsonb_typeof(p_document) <> 'object' then
            raise exception 'validation: marketplace terms document must be an object';
        end if;
        v_document_key := p_document->>'documentKey';
        v_label := p_document->>'label';
        v_consent_text := p_document->>'consentText';
        v_page := p_document->'page';
        v_snapshot_url := p_document->>'publishedSnapshotUrl';
        v_content_hash := lower(coalesce(p_document->>'contentHash', ''));
        v_revision_hash := lower(coalesce(p_document->>'revisionHash', ''));
        v_terms_version := 'cms-page:' || v_revision_hash;
        if jsonb_typeof(v_page) <> 'object' then
            raise exception 'validation: marketplace terms page snapshot must be an object';
        end if;
        v_page_id := v_page->>'id';
        v_page_path := v_page->>'path';
        v_page_title := v_page->>'title';
        v_page_description := coalesce(v_page->>'description', '');
        v_page_content := v_page->>'content';

        if coalesce(v_document_key, '') !~ '^[a-z][a-z0-9_.-]{1,79}$'
            or length(btrim(coalesce(v_label, ''))) < 1
            or length(v_label) > 200
            or length(btrim(coalesce(v_consent_text, ''))) < 1
            or length(v_consent_text) > 1000
            or length(btrim(coalesce(v_page_id, ''))) < 1
            or length(v_page_id) > 512
            or left(coalesce(v_page_path, ''), 1) <> '/'
            or length(v_page_path) > 2048
            or length(btrim(coalesce(v_page_title, ''))) < 1
            or length(v_page_title) > 500
            or length(v_page_description) > 1000
            or length(btrim(coalesce(v_page_content, ''))) < 1
            or length(btrim(coalesce(v_snapshot_url, ''))) < 1
            or length(v_snapshot_url) > 4096
            or v_content_hash !~ '^[0-9a-f]{64}$'
            or v_revision_hash !~ '^[0-9a-f]{64}$' then
            raise exception 'validation: marketplace terms document is invalid';
        end if;

        insert into stripe_connect.marketplace_terms_versions (
            terms_version,
            document_key,
            label,
            consent_text,
            page_id,
            page_path,
            page_title,
            page_description,
            page_content,
            page_snapshot,
            published_snapshot_url,
            content_hash,
            revision_hash,
            created_by
        ) values (
            v_terms_version,
            v_document_key,
            v_label,
            v_consent_text,
            v_page_id,
            v_page_path,
            v_page_title,
            v_page_description,
            v_page_content,
            v_page,
            v_snapshot_url,
            v_content_hash,
            v_revision_hash,
            v_actor
        )
        on conflict (terms_version) do nothing;

        select * into v_version
        from stripe_connect.marketplace_terms_versions
        where terms_version = v_terms_version;
        if not found
            or v_version.document_key is distinct from v_document_key
            or v_version.label is distinct from v_label
            or v_version.consent_text is distinct from v_consent_text
            or v_version.page_snapshot is distinct from v_page
            or v_version.published_snapshot_url is distinct from v_snapshot_url
            or v_version.content_hash is distinct from v_content_hash then
            raise exception 'conflict: marketplace terms revision is already bound to different evidence';
        end if;

        insert into stripe_connect.marketplace_terms_configuration (
            singleton,
            current_terms_version_id,
            legacy_terms_version,
            legacy_terms_hash,
            updated_by
        ) values (
            true,
            v_version.id,
            null,
            null,
            v_actor
        )
        on conflict (singleton) do update
        set current_terms_version_id = excluded.current_terms_version_id,
            legacy_terms_version = null,
            legacy_terms_hash = null,
            updated_by = excluded.updated_by,
            updated_at = now();

        return jsonb_build_object(
            'mode', 'published_page',
            'version', v_version.terms_version,
            'hash', v_version.content_hash,
            'documentKey', v_version.document_key,
            'label', v_version.label,
            'consentText', v_version.consent_text,
            'page', v_version.page_snapshot,
            'publishedSnapshotUrl', v_version.published_snapshot_url,
            'updatedAt', now()
        );
    end if;

    if v_legacy_version = 'legacy-unconfigured'
        or v_legacy_hash = repeat('0', 64)
        or length(v_legacy_version) < 1
        or length(v_legacy_version) > 200
        or v_legacy_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'validation: configure one published seller terms page or valid legacy version and hash';
    end if;

    insert into stripe_connect.marketplace_terms_configuration (
        singleton,
        current_terms_version_id,
        legacy_terms_version,
        legacy_terms_hash,
        updated_by
    ) values (
        true,
        null,
        v_legacy_version,
        v_legacy_hash,
        v_actor
    )
    on conflict (singleton) do update
    set current_terms_version_id = null,
        legacy_terms_version = excluded.legacy_terms_version,
        legacy_terms_hash = excluded.legacy_terms_hash,
        updated_by = excluded.updated_by,
        updated_at = now();

    return jsonb_build_object(
        'mode', 'legacy',
        'version', v_legacy_version,
        'hash', v_legacy_hash,
        'updatedAt', now()
    );
end;
$$;

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
