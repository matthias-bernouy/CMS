do $contracts$
declare
    full_offer_id bigint;
    self_result jsonb;
    admin_result jsonb;
    self_offer jsonb;
    admin_offer jsonb;
    actual_amounts bigint[];
    expected_amounts bigint[];
    actual_paths text[];
    expected_main_id text;
begin
    select offer.id into full_offer_id
    from commerce.offers offer
    where offer.slug = 'managed-offer-full';

    self_result := commerce.get_managed_offer_read_model(
        'self', full_offer_id, null, 'managed-offer-owner'
    );
    admin_result := commerce.get_managed_offer_read_model(
        'admin', null, 'managed-offer-full', null
    );
    if self_result->>'state' <> 'ok' or admin_result->>'state' <> 'ok' then
        raise exception 'managed offer detail: successful states changed: %, %', self_result, admin_result;
    end if;
    self_offer := self_result->'offer';
    admin_offer := admin_result->'offer';

    if (select count(*) from jsonb_object_keys(self_offer)) <> 25
       or self_offer ? 'inventory_revision'
       or self_offer->>'slug' <> 'managed-offer-full'
       or self_offer->'description' is distinct from 'null'::jsonb
       or self_offer->'quantity_available' is distinct from 'null'::jsonb
       or self_offer->'metadata' is distinct from
          '{"privateSellerNote":"visible","internal_note":"keep-snake-case"}'::jsonb then
        raise exception 'managed offer detail: base seller projection changed: %', self_offer;
    end if;

    if (select count(*) from jsonb_object_keys(self_offer->'seller')) <> 5
       or self_offer->'seller' ? 'cms_user_id'
       or self_offer #>> '{seller,display_name}' <> 'Managed owner' then
        raise exception 'managed offer detail: seller projection changed: %', self_offer->'seller';
    end if;
    if self_offer #> '{product,metadata}' is distinct from '{"public_spec":"24MP"}'::jsonb
       or admin_offer #> '{product,metadata}' is distinct from
          '{"public_spec":"24MP","private_cost":9000}'::jsonb
       or self_offer #>> '{product,brand,slug}' <> 'managed-offer-brand'
       or self_offer #>> '{product,primary_category,full_slug}' <> 'managed-offer-category'
       or self_offer #>> '{product,primary_category_id}' is null then
        raise exception 'managed offer detail: product visibility or classification changed';
    end if;
    if self_offer #>> '{variant,sku}' <> 'MANAGED-OFFER-V1'
       or (select count(*) from jsonb_object_keys(self_offer->'variant')) <> 4 then
        raise exception 'managed offer detail: variant projection changed: %', self_offer->'variant';
    end if;

    if (select count(*) from jsonb_object_keys(self_offer->'price_rule')) <> 7
       or self_offer->'price_rule' ? 'configured_by'
       or (select count(*) from jsonb_object_keys(admin_offer->'price_rule')) <> 8
       or admin_offer #>> '{price_rule,configured_by}' <> 'admin-1' then
        raise exception 'managed offer detail: price rule scope changed';
    end if;
    if jsonb_array_length(self_offer->'price_proposals') <> 20
       or jsonb_array_length(admin_offer->'price_proposals') <> 20
       or self_offer #> '{price_proposals,0}' ? 'proposed_by'
       or self_offer #> '{price_proposals,0}' ? 'decided_by'
       or not (admin_offer #> '{price_proposals,0}' ? 'proposed_by')
       or not (admin_offer #> '{price_proposals,0}' ? 'decided_by') then
        raise exception 'managed offer detail: proposal scope or limit changed';
    end if;
    select array_agg((entry.value->>'amount')::bigint order by entry.ordinality)
    into actual_amounts
    from jsonb_array_elements(self_offer->'price_proposals')
        with ordinality entry(value, ordinality);
    select array_agg(10000 + value order by value desc)
    into expected_amounts
    from generate_series(2, 21) value;
    if actual_amounts is distinct from expected_amounts then
        raise exception 'managed offer detail: proposal order changed: %', actual_amounts;
    end if;

    select array_agg(entry.value #>> '{media,storage_path}' order by entry.ordinality)
    into actual_paths
    from jsonb_array_elements(self_offer->'media') with ordinality entry(value, ordinality);
    select media.id::text into expected_main_id
    from commerce.media media
    where media.storage_path = 'managed-offer/main.jpg';
    if actual_paths is distinct from array[
        'managed-offer/first.jpg', 'managed-offer/main.jpg', 'managed-offer/last.jpg'
    ]::text[]
       or self_offer->>'main_image_media_id' is distinct from expected_main_id
       or self_offer #>> '{media,0,media,url}' <> '' then
        raise exception 'managed offer detail: media order or main fallback changed: %', self_offer->'media';
    end if;
end;
$contracts$;
