create table if not exists photo_albums.photo_credits (
    photo_id bigint not null,
    credit text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint photo_credits_pkey primary key (photo_id),
    constraint photo_credits_photo_id_fkey foreign key (photo_id)
        references photo_albums.photos(id) on delete cascade,
    constraint photo_credits_credit_length check (
        length(btrim(credit)) between 1 and 500
    )
);

drop trigger if exists photo_credits_touch_updated_at
    on photo_albums.photo_credits;
create trigger photo_credits_touch_updated_at
before update on photo_albums.photo_credits
for each row execute function photo_albums.touch_updated_at();
