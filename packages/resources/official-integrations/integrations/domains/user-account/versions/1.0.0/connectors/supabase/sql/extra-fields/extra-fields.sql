

create table if not exists user_account.extra_fields (
    id text primary key,
    label text not null,
    field_type text not null,
    required boolean not null default false,
    multiple boolean not null default false,
    show_in_dashboard_table boolean not null default false,
    options jsonb not null default '[]'::jsonb,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint extra_fields_id_format check (
        id ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    ),
    constraint extra_fields_label_not_blank check (
        length(btrim(label)) > 0
    ),
    constraint extra_fields_type_supported check (
        field_type in ('string', 'number', 'boolean')
    )
);

alter table user_account.accounts
    add column if not exists avatar_file_id text;

alter table user_account.accounts
    add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table user_account.accounts
    add column if not exists given_name text,
    add column if not exists surname text,
    add column if not exists birth_date date,
    add column if not exists address_line_1 text,
    add column if not exists address_line_2 text,
    add column if not exists address_line_3 text,
    add column if not exists postal_code text,
    add column if not exists city text,
    add column if not exists region text,
    add column if not exists country_code text;

alter table user_account.extra_fields
    add column if not exists options jsonb not null default '[]'::jsonb;

alter table user_account.extra_fields
    add column if not exists multiple boolean not null default false;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_avatar_file_id_not_blank'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_avatar_file_id_not_blank check (
                avatar_file_id is null or length(btrim(avatar_file_id)) > 0
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_avatar_file_id_length'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_avatar_file_id_length check (
                avatar_file_id is null or length(avatar_file_id) <= 512
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_metadata_object'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_metadata_object check (
                jsonb_typeof(metadata) = 'object'
            );
    end if;
end $$;

do $$
declare
    constraint_name text;
    constraint_expression text;
begin
    for constraint_name, constraint_expression in
        select * from (values
            ('accounts_given_name_length', 'given_name is null or length(btrim(given_name)) between 1 and 100'),
            ('accounts_surname_length', 'surname is null or length(btrim(surname)) between 1 and 100'),
            ('accounts_birth_date_range', 'birth_date is null or birth_date between date ''1900-01-01'' and current_date'),
            ('accounts_address_line_1_length', 'address_line_1 is null or length(btrim(address_line_1)) between 1 and 200'),
            ('accounts_address_line_2_length', 'address_line_2 is null or length(btrim(address_line_2)) between 1 and 200'),
            ('accounts_address_line_3_length', 'address_line_3 is null or length(btrim(address_line_3)) between 1 and 200'),
            ('accounts_postal_code_length', 'postal_code is null or length(btrim(postal_code)) between 1 and 32'),
            ('accounts_city_length', 'city is null or length(btrim(city)) between 1 and 120'),
            ('accounts_region_length', 'region is null or length(btrim(region)) between 1 and 120'),
            ('accounts_country_code_format', 'country_code is null or country_code ~ ''^[A-Z]{2}$''')
        ) as constraints(name, expression)
    loop
        if not exists (
            select 1
            from pg_constraint
            where conname = constraint_name
              and conrelid = 'user_account.accounts'::regclass
        ) then
            execute format(
                'alter table user_account.accounts add constraint %I check (%s)',
                constraint_name,
                constraint_expression
            );
        end if;
    end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'user-account-avatars',
    'user-account-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists extra_fields_position_idx
    on user_account.extra_fields(position, id);