-- Upload sessions belong to an authenticated CMS administrator, before the resource exists.
create table if not exists commerce.media_upload_sessions (
    id uuid primary key,
    owner_id text not null constraint media_upload_sessions_owner_not_blank check (btrim(owner_id) <> ''),
    resource_kind text not null constraint media_upload_sessions_resource_kind_valid check (resource_kind in ('product', 'offer')),
    offer_id bigint references commerce.offers(id) on delete restrict,
    constraint media_upload_sessions_target_valid check ((resource_kind = 'product' and offer_id is null) or (resource_kind = 'offer' and product_id is null)),
    product_id bigint references commerce.products(id) on delete restrict,
    expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists media_upload_sessions_owner_idx on commerce.media_upload_sessions(owner_id, expires_at);
create table if not exists commerce.media_uploads (
    media_id bigint primary key references commerce.media(id) on delete restrict,
    session_id uuid not null references commerce.media_upload_sessions(id) on delete restrict,
    state text not null default 'uploading' constraint media_uploads_state_valid check (state in ('uploading', 'ready', 'deleting')),
    expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists media_uploads_session_idx on commerce.media_uploads(session_id, media_id);
create index if not exists media_uploads_expiry_idx on commerce.media_uploads(expires_at);
alter table commerce.media_upload_sessions enable row level security;
alter table commerce.media_upload_sessions force row level security;
alter table commerce.media_uploads enable row level security;
alter table commerce.media_uploads force row level security;

create or replace function commerce.lock_media_upload_session(p_resource_kind text, p_session_id uuid, p_owner_id text, p_allow_expired boolean default false)
returns void language plpgsql set search_path = '' as $$
declare v_session commerce.media_upload_sessions%rowtype;
begin
    select * into v_session from commerce.media_upload_sessions where id = p_session_id for update;
    if not found or v_session.resource_kind is distinct from p_resource_kind or v_session.owner_id is distinct from p_owner_id or nullif(btrim(p_owner_id), '') is null then
        raise exception 'not_found: upload session';
    end if;
    if not p_allow_expired and v_session.expires_at <= now() then raise exception 'conflict: upload session expired'; end if;
end;
$$;

create or replace function commerce.stage_media(p_resource_kind text, p_session_id uuid, p_owner_id text, p_create_session boolean, p_payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
    v_media commerce.media%rowtype;
    v_max integer;
begin
    if p_create_session then
        insert into commerce.media_upload_sessions(id, owner_id, resource_kind) values (p_session_id, p_owner_id, p_resource_kind);
    end if;
    perform commerce.lock_media_upload_session(p_resource_kind, p_session_id, p_owner_id);
    select case p_resource_kind when 'product' then product_image_max_count else offer_image_max_count end into v_max from commerce.settings where id = 'default' for share;
    if (select count(*) from commerce.media_uploads where session_id = p_session_id) >= v_max * 2 then
        raise exception 'validation: too many pending images';
    end if;
    if p_payload->>'storageBucket' is distinct from 'commerce-media'
        or coalesce(p_payload->>'storagePath', '') not like 'upload-sessions/' || p_session_id || '/%' then
        raise exception 'validation: invalid staged image location';
    end if;
    insert into commerce.media (
        storage_bucket, storage_path, mime_type, file_size, original_filename, width, height
    ) values (
        p_payload->>'storageBucket', p_payload->>'storagePath', p_payload->>'mimeType',
        (p_payload->>'fileSize')::bigint, p_payload->>'originalFilename',
        (p_payload->>'width')::integer, (p_payload->>'height')::integer
    ) returning * into v_media;
    insert into commerce.media_uploads (session_id, media_id) values (p_session_id, v_media.id);
    return to_jsonb(v_media) || jsonb_build_object('media_id', v_media.id);
end;
$$;

create or replace function commerce.complete_media_upload(p_resource_kind text, p_session_id uuid, p_owner_id text, p_media_id bigint)
returns jsonb language plpgsql set search_path = '' as $$
begin
    perform commerce.lock_media_upload_session(p_resource_kind, p_session_id, p_owner_id);
    update commerce.media_uploads set state = 'ready'
    where session_id = p_session_id and media_id = p_media_id
        and state = 'uploading' and expires_at > now();
    if not found then raise exception 'conflict: image upload expired'; end if;
    return jsonb_build_object('ok', true, 'media_id', p_media_id);
end;
$$;
