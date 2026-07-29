revoke all on all functions in schema photo_albums from public;
revoke all on all functions in schema photo_albums from anon;
revoke all on all functions in schema photo_albums from authenticated;
revoke all on all functions in schema photo_albums from service_role;

grant execute on function photo_albums.list_managed_categories(
    text, integer, integer
) to service_role;
grant execute on function photo_albums.get_managed_category(bigint)
    to service_role;
grant execute on function photo_albums.upsert_category(
    text, text, bigint, integer, text, integer, text
) to service_role;
grant execute on function photo_albums.delete_category(bigint, integer)
    to service_role;
grant execute on function photo_albums.reorder_categories(bigint[], text)
    to service_role;

grant execute on function photo_albums.list_managed_albums(
    text, text, bigint, integer, integer
) to service_role;
grant execute on function photo_albums.get_managed_album(bigint)
    to service_role;
grant execute on function photo_albums.upsert_album(
    text, text, bigint, integer, text, bigint, text, integer, text
) to service_role;
grant execute on function photo_albums.archive_album(bigint, integer, text)
    to service_role;
grant execute on function photo_albums.reorder_albums(bigint[], text)
    to service_role;

grant execute on function photo_albums.list_managed_photos(
    bigint, integer, integer
) to service_role;
grant execute on function photo_albums.get_managed_photo(bigint)
    to service_role;
grant execute on function photo_albums.get_managed_photo_context(bigint)
    to service_role;
grant execute on function photo_albums.authorize_photo_upload(bigint, bigint)
    to service_role;
grant execute on function photo_albums.attach_album_photo(
    bigint, text, text, text, bigint, integer, integer, text,
    bigint, text, text, timestamptz, text
) to service_role;
grant execute on function photo_albums.update_album_photo(
    bigint, bigint, integer, text, text, timestamptz, text
) to service_role;
grant execute on function photo_albums.detach_album_photo(bigint, bigint, text)
    to service_role;
grant execute on function photo_albums.reorder_album_photos(
    bigint, bigint[], text
) to service_role;

grant execute on function photo_albums.list_public_categories()
    to service_role;
grant execute on function photo_albums.list_public_albums(
    text, text, integer, integer
) to service_role;
grant execute on function photo_albums.get_public_album(text)
    to service_role;
grant execute on function photo_albums.get_public_photo_context(bigint)
    to service_role;

grant execute on function photo_albums.get_settings()
    to service_role;
grant execute on function photo_albums.update_settings(
    integer, text, integer, integer, boolean, boolean, boolean, text
) to service_role;
grant execute on function photo_albums.configure_connector_credential(text)
    to service_role;
grant execute on function photo_albums.get_connector_credential_hash()
    to service_role;
