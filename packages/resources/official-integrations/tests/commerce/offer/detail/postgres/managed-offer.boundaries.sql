do $boundaries$
declare
    full_offer_id bigint;
    plain_offer_id bigint;
    zero_offer_id bigint;
    result jsonb;
    expected_first_media_id text;
begin
    select offer.id into full_offer_id
    from commerce.offers offer where offer.slug = 'managed-offer-full';
    select offer.id into plain_offer_id
    from commerce.offers offer where offer.slug = 'managed-offer-plain';
    select offer.id into zero_offer_id
    from commerce.offers offer where offer.slug = 'managed-offer-zero';

    result := commerce.get_managed_offer_read_model(
        'unsupported', full_offer_id, null, 'managed-offer-owner'
    );
    if result is distinct from '{"state":"invalid_scope"}'::jsonb then
        raise exception 'managed offer detail: invalid scope disclosed data: %', result;
    end if;
    result := commerce.get_managed_offer_read_model('self', 9007199254740991, null, null);
    if result is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'managed offer detail: missing offer precedence changed: %', result;
    end if;
    result := commerce.get_managed_offer_read_model('self', full_offer_id, null, null);
    if result is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'managed offer detail: missing identity precedence changed: %', result;
    end if;
    result := commerce.get_managed_offer_read_model('self', full_offer_id, null, '   ');
    if result is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'managed offer detail: blank identity handling changed: %', result;
    end if;
    result := commerce.get_managed_offer_read_model(
        'self', full_offer_id, null, 'managed-offer-other'
    );
    if result is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'managed offer detail: foreign ownership disclosed data: %', result;
    end if;

    result := commerce.get_managed_offer_read_model(
        'self', plain_offer_id, null, 'managed-offer-other'
    );
    if result->>'state' <> 'ok' or result #>> '{offer,slug}' <> 'managed-offer-plain' then
        raise exception 'managed offer detail: second seller isolation changed: %', result;
    end if;
    result := commerce.get_managed_offer_read_model(
        'self', plain_offer_id, null, 'managed-offer-owner'
    );
    if result is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'managed offer detail: first seller crossed ownership: %', result;
    end if;

    result := commerce.get_managed_offer_read_model(
        'admin', full_offer_id, 'managed-offer-plain', null
    );
    if result #>> '{offer,slug}' <> 'managed-offer-full' then
        raise exception 'managed offer detail: id no longer wins over slug: %', result;
    end if;
    result := commerce.get_managed_offer_read_model('admin', null, 'managed-offer-plain', null);
    if result->>'state' <> 'ok'
       or result #> '{offer,accepted_price_amount}' is distinct from 'null'::jsonb
       or result #> '{offer,variant}' is distinct from 'null'::jsonb
       or result #> '{offer,product,brand_id}' is distinct from 'null'::jsonb
       or result #> '{offer,product,brand}' is distinct from 'null'::jsonb
       or result #> '{offer,product,primary_category_id}' is distinct from 'null'::jsonb
       or result #> '{offer,product,primary_category}' is distinct from 'null'::jsonb
       or result #> '{offer,price_rule}' is distinct from 'null'::jsonb
       or result #> '{offer,price_proposals}' is distinct from '[]'::jsonb
       or result #> '{offer,media}' is distinct from '[]'::jsonb
       or result #> '{offer,main_image_media_id}' is distinct from 'null'::jsonb then
        raise exception 'managed offer detail: optional nulls changed: %', result;
    end if;

    update commerce.offer_media link
    set is_main = false
    where link.offer_id = full_offer_id;
    select media.id::text into expected_first_media_id
    from commerce.media media
    where media.storage_path = 'managed-offer/first.jpg';
    result := commerce.get_managed_offer_read_model('admin', full_offer_id, null, null);
    if result #>> '{offer,main_image_media_id}' is distinct from expected_first_media_id then
        raise exception 'managed offer detail: first-media fallback changed: %', result;
    end if;

    result := commerce.get_managed_offer_read_model('admin', zero_offer_id, null, null);
    if result #> '{offer,variant_id}' is distinct from '0'::jsonb
       or result #> '{offer,variant}' is distinct from 'null'::jsonb
       or result #> '{offer,product,brand_id}' is distinct from '0'::jsonb
       or result #> '{offer,product,brand}' is distinct from 'null'::jsonb then
        raise exception 'managed offer detail: zero identifiers changed truthy semantics: %', result;
    end if;
end;
$boundaries$;
