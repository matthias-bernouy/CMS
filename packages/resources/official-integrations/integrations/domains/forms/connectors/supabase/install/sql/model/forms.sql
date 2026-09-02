create table if not exists forms.forms (
    id bigint generated always as identity primary key,
    form_key text not null,
    title text not null,
    description text,
    access_mode text not null default 'public',
    lifecycle_status text not null default 'active',
    draft_definition jsonb not null,
    published_version integer,
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint forms_form_key_unique unique (form_key),
    constraint forms_form_key_format check (
        length(form_key) between 1 and 120
        and form_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    constraint forms_title_length check (length(btrim(title)) between 1 and 240),
    constraint forms_description_length check (description is null or length(description) <= 4000),
    constraint forms_access_mode_valid check (access_mode in ('public', 'authenticated')),
    constraint forms_lifecycle_status_valid check (lifecycle_status in ('active', 'archived')),
    constraint forms_draft_definition_object check (jsonb_typeof(draft_definition) = 'object'),
    constraint forms_published_version_valid check (published_version is null or published_version > 0),
    constraint forms_actor_length check (
        (created_by is null or length(created_by) <= 200)
        and (updated_by is null or length(updated_by) <= 200)
    )
);

create table if not exists forms.form_versions (
    id bigint generated always as identity primary key,
    form_id bigint not null references forms.forms(id) on delete restrict,
    version_number integer not null,
    definition_schema_version integer not null,
    title text not null,
    description text,
    access_mode text not null,
    definition jsonb not null,
    published_by text,
    published_at timestamptz not null default now(),
    constraint form_versions_form_version_unique unique (form_id, version_number),
    constraint form_versions_version_valid check (version_number > 0),
    constraint form_versions_schema_version_valid check (definition_schema_version > 0),
    constraint form_versions_title_length check (length(btrim(title)) between 1 and 240),
    constraint form_versions_description_length check (description is null or length(description) <= 4000),
    constraint form_versions_access_mode_valid check (access_mode in ('public', 'authenticated')),
    constraint form_versions_definition_object check (jsonb_typeof(definition) = 'object'),
    constraint form_versions_actor_length check (published_by is null or length(published_by) <= 200)
);

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'forms_published_version_fk' and conrelid = 'forms.forms'::regclass
    ) then
        alter table forms.forms
            add constraint forms_published_version_fk
            foreign key (id, published_version)
            references forms.form_versions(form_id, version_number)
            on delete restrict;
    end if;
end;
$$;

create index if not exists form_versions_form_published_idx
    on forms.form_versions(form_id, published_at desc, id desc);
create index if not exists forms_active_updated_idx
    on forms.forms(updated_at desc, id desc)
    where lifecycle_status = 'active';

drop trigger if exists forms_touch_updated_at on forms.forms;
create trigger forms_touch_updated_at
before update on forms.forms
for each row execute function forms.touch_updated_at();
