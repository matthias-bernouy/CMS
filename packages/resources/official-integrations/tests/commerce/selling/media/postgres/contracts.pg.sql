\set ON_ERROR_STOP on
set statement_timeout = '20s';

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to the assembled Commerce 1.0.0 SQL bundle.'
    \quit 3
\endif

\if :{?allow_commerce_media_schema_reset}
\else
    \echo 'Set allow_commerce_media_schema_reset=true on a disposable database.'
    \quit 3
\endif

\if :allow_commerce_media_schema_reset
\else
    \echo 'allow_commerce_media_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists commerce cascade;

do $roles$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

do $fresh_schema$
begin
    if (
        select count(*)
        from information_schema.columns
        where table_schema = 'commerce'
          and table_name = 'media'
          and column_name in ('width', 'height', 'detached_at')
    ) <> 3 then
        raise exception 'commerce media fresh install: lifecycle columns are incomplete';
    end if;
    if not exists (
        select 1
        from pg_trigger
        where tgrelid = 'commerce.media'::regclass
          and tgname = 'media_original_immutability'
          and tgenabled <> 'D'
    ) then
        raise exception 'commerce media fresh install: immutability trigger is missing';
    end if;
    if has_table_privilege('service_role', 'commerce.media', 'delete') then
        raise exception 'commerce media fresh install: service_role can delete original metadata';
    end if;
    if has_function_privilege(
        'anon',
        'commerce.attach_offer_media_v2(bigint,text,text,text,bigint,text,integer,integer,bigint,text)',
        'execute'
    ) or has_function_privilege(
        'authenticated',
        'commerce.attach_product_media_v2(bigint,text,text,text,bigint,text,integer,integer,bigint)',
        'execute'
    ) or not has_function_privilege(
        'service_role',
        'commerce.authorize_offer_media_upload(bigint,bigint,text)',
        'execute'
    ) then
        raise exception 'commerce media fresh install: media function privileges are unsafe';
    end if;
    if not (
        select relrowsecurity and relforcerowsecurity
        from pg_class
        where oid = 'commerce.media'::regclass
    ) then
        raise exception 'commerce media fresh install: media RLS is not forced';
    end if;
    if has_function_privilege(
        'anon',
        'commerce.get_offer_media_download_context(text,bigint,text)',
        'execute'
    ) or has_function_privilege(
        'authenticated',
        'commerce.get_offer_media_download_context(text,bigint,text)',
        'execute'
    ) or not has_function_privilege(
        'service_role',
        'commerce.get_offer_media_download_context(text,bigint,text)',
        'execute'
    ) then
        raise exception 'commerce media fresh install: download context privileges are unsafe';
    end if;
    if exists (
        select 1
        from pg_proc
        where oid = 'commerce.get_offer_media_download_context(text,bigint,text)'::regprocedure
          and (
              prosecdef
              or provolatile <> 's'
              or not ('search_path=""' = any(coalesce(proconfig, '{}'::text[])))
          )
    ) then
        raise exception 'commerce media fresh install: download context execution settings are unsafe';
    end if;
end;
$fresh_schema$;

set role service_role;

do $fresh_lifecycle$
declare
    v_product jsonb;
    v_seller jsonb;
    v_offer jsonb;
    v_authorization jsonb;
    v_first jsonb;
    v_replaced jsonb;
    v_removed jsonb;
    v_first_id bigint;
    v_replaced_id bigint;
    v_detached_at timestamptz;
begin
    v_product := commerce.upsert_product(null, jsonb_build_object(
        'slug', 'media-contract-product',
        'title', 'Media contract product',
        'status', 'draft',
        'visibility', 'public'
    ));
    v_authorization := commerce.authorize_product_media_upload(
        (v_product->>'id')::bigint, null
    );
    if v_authorization->'state' is distinct from '"authorized"'::jsonb
        or v_authorization->'product_id' is distinct from to_jsonb((v_product->>'id')::bigint)
        or v_authorization->'replace_media_id' is distinct from 'null'::jsonb then
        raise exception 'commerce media fresh install: product preauthorization failed';
    end if;
    v_first := commerce.attach_product_media(
        (v_product->>'id')::bigint,
        'commerce-media',
        'products/media-contract/legacy.png',
        'image/png',
        100,
        'legacy.png',
        null
    );
    v_first_id := (v_first->>'media_id')::bigint;
    if (select width is not null or height is not null from commerce.media where id = v_first_id) then
        raise exception 'commerce media fresh install: legacy attach lost nullable dimensions';
    end if;
    update commerce.media set width = 640, height = 360 where id = v_first_id;
    begin
        update commerce.media set width = 800, height = 600 where id = v_first_id;
        raise exception 'test: dimensions changed after the one-time backfill';
    exception when others then
        if sqlerrm = 'test: dimensions changed after the one-time backfill'
            or sqlerrm not like 'conflict: commerce media dimensions are immutable%' then
            raise;
        end if;
    end;

    v_authorization := commerce.authorize_product_media_upload(
        (v_product->>'id')::bigint, v_first_id
    );
    if v_authorization->'state' is distinct from '"authorized"'::jsonb
        or v_authorization->'product_id' is distinct from to_jsonb((v_product->>'id')::bigint)
        or v_authorization->'replace_media_id' is distinct from to_jsonb(v_first_id) then
        raise exception 'commerce media fresh install: product replacement preauthorization drifted';
    end if;
    v_replaced := commerce.attach_product_media_v2(
        (v_product->>'id')::bigint,
        'commerce-media',
        'products/media-contract/replacement.png',
        'image/png',
        120,
        'replacement.png',
        800,
        600,
        v_first_id
    );
    v_replaced_id := (v_replaced->>'media_id')::bigint;
    if v_replaced ?| array['replaced_storage_bucket', 'replaced_storage_path']
        or not exists (
            select 1 from commerce.media
            where id = v_first_id
              and storage_path = 'products/media-contract/legacy.png'
              and detached_at is not null
        )
        or not exists (
            select 1 from commerce.product_media
            where product_id = (v_product->>'id')::bigint
              and media_id = v_replaced_id
        ) then
        raise exception 'commerce media fresh install: product replacement was destructive: %', v_replaced;
    end if;
    if commerce.get_product_media_download_context(v_first_id)->>'state' <> 'not_found'
        or commerce.get_product_media_download_context(v_replaced_id)->>'state' <> 'ok' then
        raise exception 'commerce media fresh install: product detached access changed';
    end if;

    v_removed := commerce.remove_product_media((v_product->>'id')::bigint, v_replaced_id);
    if v_removed ?| array['storage_bucket', 'storage_path']
        or not exists (
            select 1 from commerce.media
            where id = v_replaced_id and detached_at is not null
        )
        or commerce.get_product_media_download_context(v_replaced_id)->>'state' <> 'not_found' then
        raise exception 'commerce media fresh install: product removal was destructive: %', v_removed;
    end if;

    perform commerce.attach_product_media_v2(
        (v_product->>'id')::bigint,
        'commerce-media',
        'products/media-contract/offer-fixture.png',
        'image/png',
        110,
        'offer-fixture.png',
        640,
        480,
        null
    );
    update commerce.products
    set status = 'active'
    where id = (v_product->>'id')::bigint;

    v_seller := commerce.register_my_seller('media-contract-seller', 'Media contract seller');
    v_seller := commerce.review_seller(
        (v_seller->>'id')::bigint, 'verified', 'contract-admin', null, 1
    );
    v_offer := commerce.create_my_offer('media-contract-seller', jsonb_build_object(
        'productId', v_product->>'id',
        'slug', 'media-contract-offer',
        'title', 'Media contract offer'
    ));
    begin
        perform commerce.authorize_offer_media_upload(
            (v_offer->>'id')::bigint, null, 'another-seller'
        );
        raise exception 'test: another seller preauthorized an offer upload';
    exception when others then
        if sqlerrm = 'test: another seller preauthorized an offer upload'
            or sqlerrm not like 'not_found: offer%' then
            raise;
        end if;
    end;
    v_first := commerce.attach_offer_media_v2(
        (v_offer->>'id')::bigint,
        'commerce-media',
        'offers/media-contract/first.webp',
        'image/webp',
        90,
        'first.webp',
        512,
        384,
        null,
        'media-contract-seller'
    );
    v_first_id := (v_first->>'media_id')::bigint;
    v_authorization := commerce.authorize_offer_media_upload(
        (v_offer->>'id')::bigint, v_first_id, 'media-contract-seller'
    );
    if v_authorization->'state' is distinct from '"authorized"'::jsonb
        or v_authorization->'offer_id' is distinct from to_jsonb((v_offer->>'id')::bigint)
        or v_authorization->'replace_media_id' is distinct from to_jsonb(v_first_id) then
        raise exception 'commerce media fresh install: offer replacement preauthorization drifted';
    end if;
    v_replaced := commerce.attach_offer_media_v2(
        (v_offer->>'id')::bigint,
        'commerce-media',
        'offers/media-contract/replacement.webp',
        'image/webp',
        95,
        'replacement.webp',
        768,
        576,
        v_first_id,
        'media-contract-seller'
    );
    v_replaced_id := (v_replaced->>'media_id')::bigint;
    if v_replaced ?| array['replaced_storage_bucket', 'replaced_storage_path']
        or not exists (
            select 1 from commerce.media
            where id = v_first_id and detached_at is not null
        ) then
        raise exception 'commerce media fresh install: offer replacement was destructive: %', v_replaced;
    end if;
    if commerce.get_offer_media_download_context(
        'admin', v_first_id, null
    )->>'state' <> 'not_found' or commerce.get_offer_media_download_context(
        'self', v_first_id, 'media-contract-seller'
    )->>'state' <> 'not_found' or commerce.get_offer_media_download_context(
        'public', v_first_id, null
    )->>'state' <> 'not_found' then
        raise exception 'commerce media fresh install: detached offer remained downloadable';
    end if;
    v_removed := commerce.remove_offer_media(
        (v_offer->>'id')::bigint, v_replaced_id, 'media-contract-seller'
    );
    if v_removed ?| array['storage_bucket', 'storage_path']
        or not exists (
            select 1 from commerce.media
            where id = v_replaced_id and detached_at is not null
        ) then
        raise exception 'commerce media fresh install: offer removal was destructive: %', v_removed;
    end if;
    select detached_at into strict v_detached_at
    from commerce.media where id = v_replaced_id;

    begin
        update commerce.media set storage_path = 'changed' where id = v_first_id;
        raise exception 'test: original storage path changed';
    exception when others then
        if sqlerrm = 'test: original storage path changed'
            or sqlerrm not like 'conflict: commerce media original metadata is immutable%' then
            raise;
        end if;
    end;
    begin
        update commerce.media set id = id + 1000000 where id = v_replaced_id;
        raise exception 'test: original media identity changed';
    exception when others then
        if sqlerrm = 'test: original media identity changed'
            or sqlerrm not like 'conflict: commerce media original metadata is immutable%' then
            raise;
        end if;
    end;
    begin
        delete from commerce.media where id = v_first_id;
        raise exception 'test: original metadata was deleted';
    exception when insufficient_privilege then
        null;
    when others then
        if sqlerrm = 'test: original metadata was deleted'
            or sqlerrm not like 'conflict: commerce media originals cannot be deleted%' then
            raise;
        end if;
    end;
end;
$fresh_lifecycle$;

do $multi_link_access$
declare
    v_product_id bigint;
    v_owner jsonb;
    v_other_seller jsonb;
    v_owner_offer jsonb;
    v_other_offer jsonb;
    v_unauthorized_first jsonb;
    v_authorized_first jsonb;
    v_media_id bigint;
    v_context jsonb;
begin
    select id into strict v_product_id
    from commerce.products
    where slug = 'media-contract-product';

    v_owner := commerce.register_my_seller(
        'media-contract-shared-owner', 'Media contract shared owner'
    );
    v_owner := commerce.review_seller(
        (v_owner->>'id')::bigint, 'verified', 'contract-admin', null, 1
    );
    v_other_seller := commerce.register_my_seller(
        'media-contract-shared-other', 'Media contract shared other seller'
    );
    v_owner_offer := commerce.create_my_offer(
        'media-contract-shared-owner',
        jsonb_build_object(
            'productId', v_product_id::text,
            'slug', 'media-contract-shared-owner-offer',
            'title', 'Media contract shared owner offer'
        )
    );
    v_other_offer := commerce.create_my_offer(
        'media-contract-shared-other',
        jsonb_build_object(
            'productId', v_product_id::text,
            'slug', 'media-contract-shared-other-offer',
            'title', 'Media contract shared other offer'
        )
    );

    v_unauthorized_first := commerce.attach_offer_media_v2(
        (v_other_offer->>'id')::bigint,
        'commerce-media',
        'offers/media-contract/shared-unauthorized-first.webp',
        'image/webp',
        101,
        'shared-unauthorized-first.webp',
        640,
        480,
        null,
        'media-contract-shared-other'
    );
    insert into commerce.offer_media (offer_id, media_id, sort_order, is_main)
    values (
        (v_owner_offer->>'id')::bigint,
        (v_unauthorized_first->>'media_id')::bigint,
        0,
        true
    );

    v_authorized_first := commerce.attach_offer_media_v2(
        (v_owner_offer->>'id')::bigint,
        'commerce-media',
        'offers/media-contract/shared-authorized-first.webp',
        'image/webp',
        102,
        'shared-authorized-first.webp',
        768,
        576,
        null,
        'media-contract-shared-owner'
    );
    insert into commerce.offer_media (offer_id, media_id, sort_order, is_main)
    values (
        (v_other_offer->>'id')::bigint,
        (v_authorized_first->>'media_id')::bigint,
        1,
        false
    );

    v_other_seller := commerce.review_seller(
        (v_other_seller->>'id')::bigint, 'suspended', 'contract-admin', null, 1
    );
    -- Both offers are active so public authorization must evaluate every linked seller.
    update commerce.offers
    set publication_status = 'active', accepted_price_amount = 12000
    where id in (
        (v_owner_offer->>'id')::bigint,
        (v_other_offer->>'id')::bigint
    );

    foreach v_media_id in array array[
        (v_unauthorized_first->>'media_id')::bigint,
        (v_authorized_first->>'media_id')::bigint
    ]
    loop
        v_context := commerce.get_offer_media_download_context(
            'public', v_media_id, null
        );
        if v_context->>'state' <> 'ok'
            or (v_context->'media'->>'id')::bigint <> v_media_id then
            raise exception
                'commerce media multi-link: public access depended on link order: %',
                v_context;
        end if;

        v_context := commerce.get_offer_media_download_context(
            'self', v_media_id, 'media-contract-shared-owner'
        );
        if v_context->>'state' <> 'ok'
            or (v_context->'media'->>'id')::bigint <> v_media_id then
            raise exception
                'commerce media multi-link: owner access depended on link order: %',
                v_context;
        end if;

        v_context := commerce.get_offer_media_download_context(
            'self', v_media_id, 'media-contract-unrelated-seller'
        );
        if v_context->>'state' <> 'not_found' or v_context ? 'media' then
            raise exception
                'commerce media multi-link: unauthorized access leaked media: %',
                v_context;
        end if;
    end loop;
end;
$multi_link_access$;

reset role;

\ir :cms_integration_schema_bundle

do $fresh_replay$
declare
    v_media record;
begin
    if not exists (
        select 1 from commerce.media
        where storage_path = 'offers/media-contract/replacement.webp'
          and width = 768
          and height = 576
          and detached_at is not null
    ) then
        raise exception 'commerce media replay: retained metadata was reset';
    end if;
    if (
        select count(*)
        from commerce.media
        where storage_path in (
            'offers/media-contract/shared-unauthorized-first.webp',
            'offers/media-contract/shared-authorized-first.webp'
        )
    ) <> 2 then
        raise exception 'commerce media replay: multi-link fixtures were reset';
    end if;

    for v_media in
        select id, storage_path
        from commerce.media
        where storage_path in (
            'offers/media-contract/shared-unauthorized-first.webp',
            'offers/media-contract/shared-authorized-first.webp'
        )
    loop
        if (
            select count(*)
            from commerce.offer_media
            where media_id = v_media.id
        ) <> 2
            or commerce.get_offer_media_download_context(
                'public', v_media.id, null
            )->>'state' <> 'ok'
            or commerce.get_offer_media_download_context(
                'self', v_media.id, 'media-contract-shared-owner'
            )->>'state' <> 'ok' then
            raise exception
                'commerce media replay: multi-link access drifted for %',
                v_media.storage_path;
        end if;
    end loop;
end;
$fresh_replay$;

drop schema commerce cascade;
\ir :cms_integration_schema_bundle

insert into commerce.products (slug, title, status, visibility)
values ('legacy-media-product', 'Legacy media product', 'draft', 'public')
returning id as product_id \gset legacy_

drop trigger media_original_immutability on commerce.media;
alter table commerce.media drop column width cascade;
alter table commerce.media drop column height cascade;
alter table commerce.media drop column detached_at cascade;
drop function commerce.enforce_media_original_immutability();

insert into commerce.media (
    storage_bucket, storage_path, mime_type, file_size, original_filename
) values (
    'commerce-media', 'products/legacy/original.jpg', 'image/jpeg', 321, 'original.jpg'
) returning id as media_id \gset legacy_

insert into commerce.product_media (product_id, media_id, sort_order, is_main)
values (:legacy_product_id, :legacy_media_id, 0, true);

\ir :cms_integration_schema_bundle

do $existing_upgrade$
begin
    if not exists (
        select 1
        from commerce.media media
        join commerce.product_media link on link.media_id = media.id
        join commerce.products product on product.id = link.product_id
        where product.slug = 'legacy-media-product'
          and media.storage_path = 'products/legacy/original.jpg'
          and media.width is null
          and media.height is null
          and media.detached_at is null
    ) then
        raise exception 'commerce media upgrade: historical media or owner link changed';
    end if;
end;
$existing_upgrade$;

set role service_role;
update commerce.media
set width = 1200, height = 800
where id = :legacy_media_id;
reset role;

\ir :cms_integration_schema_bundle

do $existing_replay$
begin
    if not exists (
        select 1
        from commerce.media media
        join commerce.product_media link on link.media_id = media.id
        join commerce.products product on product.id = link.product_id
        where product.slug = 'legacy-media-product'
          and media.storage_path = 'products/legacy/original.jpg'
          and media.width = 1200
          and media.height = 800
          and media.detached_at is null
    ) then
        raise exception 'commerce media replay: historical backfill or owner link was reset';
    end if;
    if has_table_privilege('service_role', 'commerce.media', 'delete')
        or not has_function_privilege(
            'service_role',
            'commerce.get_product_media_download_context(bigint)',
            'execute'
        )
        or not has_function_privilege(
            'service_role',
            'commerce.get_offer_media_download_context(text,bigint,text)',
            'execute'
        )
        or has_function_privilege(
            'anon',
            'commerce.get_offer_media_download_context(text,bigint,text)',
            'execute'
        )
        or has_function_privilege(
            'authenticated',
            'commerce.get_offer_media_download_context(text,bigint,text)',
            'execute'
        ) then
        raise exception 'commerce media replay: privileges drifted';
    end if;
    if exists (
        select 1
        from pg_proc
        where oid = 'commerce.get_offer_media_download_context(text,bigint,text)'::regprocedure
          and (
              prosecdef
              or provolatile <> 's'
              or not ('search_path=""' = any(coalesce(proconfig, '{}'::text[])))
          )
    ) then
        raise exception 'commerce media replay: download context execution settings drifted';
    end if;
end;
$existing_replay$;
