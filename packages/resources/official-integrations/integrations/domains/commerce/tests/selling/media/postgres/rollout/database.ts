import { SQL } from "bun";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { resolve } from "node:path";
import { loadSupabaseSchemaSql } from "../../../../../../../../tests/helpers/supabaseSql";

export type MediaRolloutSeed = {
    offerId: number;
    offerMediaId: number;
    offerOriginalPath: string;
    productId: number;
    productMediaId: number;
    productOriginalPath: string;
    sellerCmsUserId: string;
};

export function mediaDatabaseTestEnabled(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim()) && process.env.ALLOW_COMMERCE_MEDIA_SCHEMA_RESET === "true";
}

export async function installCurrentCommerceSchema(): Promise<SQL> {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl || !mediaDatabaseTestEnabled()) {
        throw new Error(
            "DATABASE_URL and ALLOW_COMMERCE_MEDIA_SCHEMA_RESET=true are required for the media rollout test.",
        );
    }
    const database = new SQL(databaseUrl, { max: 1 });
    await database.unsafe("drop schema if exists commerce cascade");
    await database.unsafe(`
        do $roles$
        begin
            if not exists (select 1 from pg_roles where rolname = 'anon') then
                create role anon nologin;
            end if;
            if not exists (select 1 from pg_roles where rolname = 'authenticated') then
                create role authenticated nologin;
            end if;
            if not exists (select 1 from pg_roles where rolname = 'service_role') then
                create role service_role nologin bypassrls;
            end if;
        end;
        $roles$;
    `);
    const commerceRoot = resolve(OFFICIAL_INTEGRATIONS_ROOT, "domains/commerce");
    await database.unsafe(await loadSupabaseSchemaSql(commerceRoot));
    return database;
}

export async function seedMediaRollout(database: SQL): Promise<MediaRolloutSeed> {
    const product = await jsonValue(
        database`select commerce.upsert_product(
            null,
            ${{
                slug: "legacy-edge-rollout-product",
                title: "Legacy Edge rollout product",
                status: "draft",
                visibility: "public",
            }}::jsonb
        ) as value`,
    );
    const productId = Number(product.id);
    const productOriginalPath = "products/rollout/original-product.png";
    const productMedia = await jsonValue(
        database`select commerce.attach_product_media_v2(
            ${productId}, 'commerce-media', ${productOriginalPath}, 'image/png',
            120, 'original-product.png', 640, 480, null
        ) as value`,
    );
    await database`select commerce.attach_product_media_v2(
        ${productId}, 'commerce-media', 'products/rollout/support-product.png', 'image/png',
        100, 'support-product.png', 320, 240, null
    )`;
    await database`update commerce.products set status = 'active' where id = ${productId}`;

    const sellerCmsUserId = "legacy-edge-rollout-seller";
    const seller = await jsonValue(
        database`select commerce.register_my_seller(
            ${sellerCmsUserId}, 'Legacy Edge rollout seller'
        ) as value`,
    );
    await database`select commerce.review_seller(
        ${Number(seller.id)}, 'verified', 'rollout-admin', null, 1
    )`;
    const offer = await jsonValue(
        database`select commerce.create_my_offer(
            ${sellerCmsUserId},
            ${{
                productId: String(productId),
                slug: "legacy-edge-rollout-offer",
                title: "Legacy Edge rollout offer",
            }}::jsonb
        ) as value`,
    );
    const offerId = Number(offer.id);
    const offerOriginalPath = "offers/rollout/original-offer.png";
    const offerMedia = await jsonValue(
        database`select commerce.attach_offer_media_v2(
            ${offerId}, 'commerce-media', ${offerOriginalPath}, 'image/png',
            110, 'original-offer.png', 640, 480, null, ${sellerCmsUserId}
        ) as value`,
    );
    return {
        offerId,
        offerMediaId: Number(offerMedia.media_id),
        offerOriginalPath,
        productId,
        productMediaId: Number(productMedia.media_id),
        productOriginalPath,
        sellerCmsUserId,
    };
}

export async function executeCurrentMediaRpc(
    database: SQL,
    name: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    switch (name) {
        case "attach_offer_media":
            return jsonValue(database`select commerce.attach_offer_media(
                ${body.p_offer_id}, ${body.p_storage_bucket}, ${body.p_storage_path},
                ${body.p_mime_type}, ${body.p_file_size}, ${body.p_original_filename},
                ${body.p_replace_media_id}, ${body.p_cms_user_id}
            ) as value`);
        case "remove_offer_media":
            return jsonValue(database`select commerce.remove_offer_media(
                ${body.p_offer_id}, ${body.p_media_id}, ${body.p_cms_user_id}
            ) as value`);
        case "attach_product_media":
            return jsonValue(database`select commerce.attach_product_media(
                ${body.p_product_id}, ${body.p_storage_bucket}, ${body.p_storage_path},
                ${body.p_mime_type}, ${body.p_file_size}, ${body.p_original_filename},
                ${body.p_replace_media_id}
            ) as value`);
        case "remove_product_media":
            return jsonValue(database`select commerce.remove_product_media(
                ${body.p_product_id}, ${body.p_media_id}
            ) as value`);
        default:
            throw new Error(`Unexpected legacy media RPC "${name}".`);
    }
}

async function jsonValue(query: PromiseLike<Array<{ value: unknown }>>): Promise<Record<string, unknown>> {
    const value = (await query)[0]?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Commerce media RPC returned a non-object value.");
    }
    return value as Record<string, unknown>;
}
