do $commerce_media_heif$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'commerce.media'::regclass
          and conname = 'media_mime_type_valid'
          and pg_get_constraintdef(oid) like '%image/heic%'
          and pg_get_constraintdef(oid) like '%image/heif%'
    ) then
        alter table commerce.media drop constraint if exists media_mime_type_valid;
        alter table commerce.media add constraint media_mime_type_valid check (
            mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif')
        );
    end if;
end;
$commerce_media_heif$;
