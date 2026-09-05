import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";
import { loadSupabaseSchemaSql } from "../../../../../../tests/helpers/supabaseSql";

type RecordValue = Record<string, any>;

const commerceRoot = new URL("../../..", import.meta.url);
const definitionPath = resolve(import.meta.dir, "../../../definition.json");
describe("Commerce retained original contract", () => {
    test("installs additive intrinsic metadata and immutable retained originals", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot, "install/sql/schema.manifest.json");

        expect(schema).toContain("add column if not exists width integer");
        expect(schema).toContain("add column if not exists height integer");
        expect(schema).toContain("add column if not exists detached_at timestamptz");
        expect(schema).toContain("width::bigint * height::bigint <= 40000000");
        expect(schema).toContain("media_original_immutability");
        expect(schema).toContain("commerce media originals cannot be deleted");
        expect(schema).toContain("old.width is not null or old.height is not null");
        expect(schema).toContain("new.id, new.storage_bucket");
        expect(schema).toContain("old.id, old.storage_bucket");
        expect(schema).toContain("revoke delete on commerce.media from service_role");
    });

    test("keeps legacy attach signatures while moving new uploads to dimension-aware v2 RPCs", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot, "install/sql/schema.manifest.json");

        expect(schema).toContain("function commerce.attach_product_media_v2(");
        expect(schema).toContain("function commerce.attach_offer_media_v2(");
        expect(schema).toContain("function commerce.attach_product_media(");
        expect(schema).toContain("function commerce.attach_offer_media(");
        expect(schema).toContain("p_width integer");
        expect(schema).toContain("p_height integer");
        expect(schema).not.toContain("'replaced_storage_path'");
        expect(schema).not.toContain("'replaced_storage_bucket'");
    });

    test("makes remove and replacement non-destructive and detached downloads fail closed", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot, "install/sql/schema.manifest.json");

        expect(schema).not.toMatch(/delete from commerce\.media/i);
        expect(schema).toContain("set detached_at = coalesce(detached_at, now())");
        expect(schema).toContain("and media.detached_at is null");
        expect(schema).toContain("get_product_media_download_context");
        expect(schema).toContain("authorize_product_media_upload");
        expect(schema).toContain("authorize_offer_media_upload");
        expect(schema).toContain("'product_id', p_product_id");
        expect(schema).toContain("'offer_id', p_offer_id");
        expect(schema).toContain("'replace_media_id', p_replace_media_id");
    });

    test("exposes detailed dimensions and main-image dimensions through Source contracts", async () => {
        const definition = await loadIntegrationDefinition<RecordValue>(definitionPath);
        const source = definition.artifacts.find((artifact: RecordValue) => artifact.source).source;
        const endpoints = Object.fromEntries(
            source.endpoints.map((endpoint: RecordValue) => [endpoint.endpointId, endpoint]),
        );

        for (const id of ["offer", "myOffer", "manageOffer", "product", "manageProduct"]) {
            const properties = endpoints[id].output[0].body.properties;
            const mediaProperties = properties.media.items.properties.media.properties;
            expect(mediaProperties.width).toEqual({ type: "number", nullable: true });
            expect(mediaProperties.height).toEqual({ type: "number", nullable: true });
        }
        for (const id of ["offers", "listMyOffers"]) {
            const properties = endpoints[id].output[0].body.properties.items.items.properties;
            expect(properties.mainImageWidth).toEqual({ type: "number", nullable: true });
            expect(properties.mainImageHeight).toEqual({ type: "number", nullable: true });
        }
    });

    test("projects detached removal metadata without exposing retained Storage coordinates", async () => {
        const definition = await loadIntegrationDefinition<RecordValue>(definitionPath);
        const source = definition.artifacts.find((artifact: RecordValue) => artifact.source).source;
        const endpoints = Object.fromEntries(
            source.endpoints.map((endpoint: RecordValue) => [endpoint.endpointId, endpoint]),
        );

        for (const id of ["removeOfferImage", "removeProductImage"]) {
            const properties = endpoints[id].output[0].body.properties;
            expect(properties.detachedAt).toEqual({ type: "string", nullable: true });
            expect(properties.storageBucket).toBeUndefined();
            expect(properties.storagePath).toBeUndefined();
        }
    });
});
