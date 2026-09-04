import { assert, expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 85, 76, 86, 73, 65]);

const publishedAlbum = defineUpgradeScenario({
    name: "preserves a published album and its original image",
    from: ">=1.0.0 <3.1.0",
    async seedBeforeUpgrade(context) {
        const [category] = await context.database.query(
            `insert into photo_albums.categories (slug, name, description, created_by)
             values ($1, $2, $3, $4) returning id::text as id`,
            ["upgrade-landscapes", "Upgrade landscapes", "Persisted category", "fixture-author"],
        );
        const categoryId = requiredId(category?.id, "category");
        const [album] = await context.database.query(
            `insert into photo_albums.albums
                (category_id, slug, title, description, status, published_at, created_by)
             values ($1::bigint, $2, $3, $4, 'published', $5::timestamptz, $6)
             returning id::text as id`,
            [
                categoryId,
                "upgrade-summer",
                "Summer before upgrade",
                "Must survive",
                "2026-06-01T10:00:00Z",
                "fixture-author",
            ],
        );
        const albumId = requiredId(album?.id, "album");
        const storagePath = `upgrade-fixtures/${albumId}/original.png`;
        await context.storage.ensureBucket("photo-albums-originals");
        await context.storage.upload("photo-albums-originals", storagePath, image, "image/png");
        const [photo] = await context.database.query(
            `insert into photo_albums.photos
                (album_id, storage_path, mime_type, file_size, width, height, original_filename, alt, caption, created_by)
             values ($1::bigint, $2, 'image/png', $3, 1, 1, 'original.png', $4, $5, $6)
             returning id::text as id`,
            [albumId, storagePath, image.byteLength, "Persistent beach", "Business fixture", "fixture-author"],
        );
        return { categoryId, albumId, photoId: requiredId(photo?.id, "photo"), storagePath };
    },
    async assertAfterUpgrade(context, state) {
        const rows = await context.database.query(
            `select category.id::text as "categoryId", album.id::text as "albumId",
                    photo.id::text as "photoId", album.title, album.status,
                    photo.storage_path as "storagePath", photo.alt, photo.caption
             from photo_albums.categories category
             join photo_albums.albums album on album.category_id = category.id
             join photo_albums.photos photo on photo.album_id = album.id
             where category.id = $1::bigint and album.id = $2::bigint and photo.id = $3::bigint`,
            [state.categoryId, state.albumId, state.photoId],
        );
        expect(rows).toEqual([
            {
                ...state,
                title: "Summer before upgrade",
                status: "published",
                alt: "Persistent beach",
                caption: "Business fixture",
            },
        ]);
        expect(await context.storage.exists("photo-albums-originals", state.storagePath)).toBe(true);
        expect([...(await context.storage.download("photo-albums-originals", state.storagePath))]).toEqual([...image]);
        const response = await context.cms.request("/.cms/sources/photo-albums/album?slug=upgrade-summer");
        assert(response.status === 200, `CMS album read returned HTTP ${response.status}`);
        assert(response.body && typeof response.body === "object" && !Array.isArray(response.body));
        assert(response.body.title === "Summer before upgrade", "CMS album read did not preserve the title");
        assert(response.body.slug === "upgrade-summer", "CMS album read did not preserve the public slug");
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [publishedAlbum],
});

function requiredId(value: unknown, resource: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`Upgrade fixture did not create its ${resource}`);
    }
    return value;
}
