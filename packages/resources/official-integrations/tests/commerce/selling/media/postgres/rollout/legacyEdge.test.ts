import type { SQL } from "bun";
import { expect, test } from "bun:test";
import { imageForm, pngBytes } from "../../fixtures";
import {
    installCurrentCommerceSchema,
    mediaDatabaseTestEnabled,
    seedMediaRollout,
    type MediaRolloutSeed,
} from "./database";
import { loadLegacyCommerceArtifact, LEGACY_COMMERCE_EDGE_COMMIT } from "./legacyArtifact";
import { installLegacyEdgeHarness, type LegacyEdgeCall } from "./legacyEdgeHarness";

const databaseTest = mediaDatabaseTestEnabled() ? test : test.skip;

databaseTest(
    `keeps originals with Edge ${LEGACY_COMMERCE_EDGE_COMMIT.slice(0, 8)} against current SQL`,
    async () => {
        const database = await installCurrentCommerceSchema();
        const artifact = await loadLegacyCommerceArtifact();
        const seed = await seedMediaRollout(database);
        const harness = installLegacyEdgeHarness(database, artifact.handler, [
            seed.offerOriginalPath,
            seed.productOriginalPath,
            "products/rollout/support-product.png",
        ]);
        try {
            await exerciseProductLifecycle(database, harness, seed);
            await exerciseOfferLifecycle(database, harness, seed);
        } finally {
            harness.close();
            await artifact.cleanup();
            await database.close();
        }
    },
    60_000,
);

type Harness = ReturnType<typeof installLegacyEdgeHarness>;

async function exerciseProductLifecycle(database: SQL, harness: Harness, seed: MediaRolloutSeed): Promise<void> {
    const start = harness.calls.length;
    const replaced = await harness.request(
        `/admin/product/image/replace?productId=${seed.productId}&mediaId=${seed.productMediaId}`,
        {
            admin: true,
            formData: imageForm(pngBytes(800, 600), { filename: "replacement.png", type: "image/png" }),
        },
    );
    await expectSuccess(replaced, harness.calls.slice(start));
    const replacement = (await replaced.json()) as { mediaId: number; storagePath: string };
    const removed = await harness.request(
        `/admin/product/image?productId=${seed.productId}&mediaId=${replacement.mediaId}`,
        { admin: true, method: "DELETE" },
    );

    await expectSuccess(removed, harness.calls.slice(start));
    expect(callKinds(harness.calls.slice(start))).toEqual([
        "storage:POST",
        "attach_product_media",
        "remove_product_media",
    ]);
    expect(noStorageDelete(harness.calls.slice(start))).toBeTrue();
    expect(harness.storagePaths).toContain(seed.productOriginalPath);
    expect(harness.storagePaths).toContain(replacement.storagePath);
    await expectDetached(database, seed.productMediaId, replacement.mediaId);
}

async function exerciseOfferLifecycle(database: SQL, harness: Harness, seed: MediaRolloutSeed): Promise<void> {
    const start = harness.calls.length;
    const replaced = await harness.request(
        `/me/offer/image/replace?offerId=${seed.offerId}&mediaId=${seed.offerMediaId}`,
        {
            formData: imageForm(pngBytes(960, 720), { filename: "replacement.png", type: "image/png" }),
            userId: seed.sellerCmsUserId,
        },
    );
    await expectSuccess(replaced, harness.calls.slice(start));
    const replacement = (await replaced.json()) as { mediaId: number; storagePath: string };
    const removed = await harness.request(`/me/offer/image?offerId=${seed.offerId}&mediaId=${replacement.mediaId}`, {
        method: "DELETE",
        userId: seed.sellerCmsUserId,
    });

    await expectSuccess(removed, harness.calls.slice(start));
    expect(callKinds(harness.calls.slice(start))).toEqual(["storage:POST", "attach_offer_media", "remove_offer_media"]);
    expect(noStorageDelete(harness.calls.slice(start))).toBeTrue();
    expect(harness.storagePaths).toContain(seed.offerOriginalPath);
    expect(harness.storagePaths).toContain(replacement.storagePath);
    await expectDetached(database, seed.offerMediaId, replacement.mediaId);
}

async function expectDetached(database: SQL, ...ids: number[]): Promise<void> {
    for (const id of ids) {
        const rows = await database`
            select id, storage_path, detached_at
            from commerce.media
            where id = ${id}
        `;
        expect(rows).toHaveLength(1);
        expect(rows[0]?.storage_path).toBeString();
        expect(rows[0]?.detached_at).not.toBeNull();
    }
}

function callKinds(calls: LegacyEdgeCall[]): string[] {
    return calls.map((call) => (call.url.includes("/storage/v1/object/") ? `storage:${call.method}` : call.resource));
}

function noStorageDelete(calls: LegacyEdgeCall[]): boolean {
    return !calls.some((call) => call.url.includes("/storage/v1/object/") && call.method === "DELETE");
}

async function expectSuccess(response: Response, calls: LegacyEdgeCall[]): Promise<void> {
    if (response.status !== 200) {
        throw new Error(
            `Legacy Edge returned ${response.status}: ${await response.clone().text()}; calls=${JSON.stringify(
                callKinds(calls),
            )}`,
        );
    }
    expect(response.status).toBe(200);
}
