create table if not exists forms.media (
    id bigint generated always as identity primary key,
    form_id bigint not null references forms.forms(id) on delete restrict,
    storage_bucket text not null,
    storage_path text not null,
    mime_type text not null,
    file_size bigint not null,
    width integer not null,
    height integer not null,
    original_filename text not null,
    created_by text,
    created_at timestamptz not null default now(),
    constraint forms_media_form_identity_unique unique (form_id, id),
    constraint forms_media_storage_unique unique (storage_bucket, storage_path),
    constraint forms_media_bucket_valid check (storage_bucket = 'forms-media'),
    constraint forms_media_file_size_valid check (file_size between 1 and 10485760),
    constraint forms_media_mime_type_valid check (
        mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
    ),
    constraint forms_media_dimensions_valid check (
        width > 0 and height > 0 and width::bigint * height::bigint <= 40000000
    ),
    constraint forms_media_filename_length check (length(btrim(original_filename)) between 1 and 500),
    constraint forms_media_actor_length check (created_by is null or length(created_by) <= 200)
);

create table if not exists forms.form_draft_media (
    form_id bigint not null references forms.forms(id) on delete restrict,
    media_id bigint not null,
    created_at timestamptz not null default now(),
    primary key (form_id, media_id),
    constraint form_draft_media_owner_fk foreign key (form_id, media_id)
        references forms.media(form_id, id) on delete restrict
);

create table if not exists forms.form_version_media (
    form_id bigint not null,
    version_number integer not null,
    media_id bigint not null,
    created_at timestamptz not null default now(),
    primary key (form_id, version_number, media_id),
    constraint form_version_media_version_fk foreign key (form_id, version_number)
        references forms.form_versions(form_id, version_number) on delete restrict,
    constraint form_version_media_owner_fk foreign key (form_id, media_id)
        references forms.media(form_id, id) on delete restrict
);

create index if not exists forms_media_form_created_idx on forms.media(form_id, created_at desc, id desc);
create index if not exists form_draft_media_media_idx on forms.form_draft_media(media_id);
create index if not exists form_version_media_media_idx on forms.form_version_media(media_id);

create or replace function forms.reject_media_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'conflict: form media originals are immutable';
end;
$$;

drop trigger if exists forms_media_immutable on forms.media;
create trigger forms_media_immutable
before update or delete on forms.media
for each row execute function forms.reject_media_mutation();

do $forms_storage_bucket$
begin
    if to_regclass('storage.buckets') is not null then
        execute $sql$
            insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
            values (
                'forms-media', 'forms-media', false, 10485760,
                array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
            )
            on conflict (id) do update set
                public = false,
                file_size_limit = excluded.file_size_limit,
                allowed_mime_types = excluded.allowed_mime_types
        $sql$;
    end if;
end;
$forms_storage_bucket$;
