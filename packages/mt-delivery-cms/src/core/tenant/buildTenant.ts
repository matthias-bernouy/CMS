import type { Db } from "mongodb";
import type { Tenant } from "@bernouy/mt-cms-control";
import { MongoCmsRepository, DeliveryBuilder, BuildEnhancer, HttpVariantGenerator, PlaywrightSession, pageBucketName } from "@bernouy/cms";
import { StorageDirectClient } from "@bernouy/cdn";

export type BuildTenantOptions = {
    /** Shared Playwright session (Chromium launched once per Delivery). */
    session?: PlaywrightSession;
    /**
     * Pattern for variant URLs delivered by the resize backend, e.g.
     *   "{url}?w={width}&format={format}"
     * `{url}` = the original image URL stored in pages, `{width}` =
     * resolved ladder width, `{format}` = chosen image format.
     * Omit to ship pages as-rendered (no srcset).
     */
    variantUrlPattern?: string;
};

/**
 * One delivery build cycle for a single tenant. Idempotent — DeliveryBuilder
 * fingerprints the repo state in the bucket's `_manifest.json` and bails
 * before doing work when nothing changed since the previous cycle.
 */
export async function buildTenant(
    db: Db,
    tenant: Tenant,
    options: BuildTenantOptions = {},
): Promise<void> {
    if (!tenant.delivery?.publicCdn) throw new Error(`tenant ${tenant.id} has no delivery.publicCdn`);

    const repo = new MongoCmsRepository(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await repo.init();

    const bucket = await StorageDirectClient.fromCredential({
        providerOrigin:  tenant.delivery.publicCdn.url,
        credentialToken: tenant.delivery.publicCdn.bucketCredential,
    });

    const ladder = [320, 640, 960, 1280, 1920];

    const enhancePage = options.session
        ? (path: string, html: string) => new BuildEnhancer({ session: options.session!, ladder }).enhance(path, html)
        : undefined;

    const generator = options.variantUrlPattern
        ? new HttpVariantGenerator({
            buildVariantUrl: (url, width, format) => options.variantUrlPattern!
                .replace("{url}", url)
                .replace("{width}", String(width))
                .replace("{format}", format ?? "webp"),
        })
        : new HttpVariantGenerator({
            // No resize backend wired — generator throws on every spec.
            // DeliveryBuilder catches and reports per-page failures.
            buildVariantUrl: () => { throw new Error("variantUrlPattern not configured"); },
        });

    const builder = new DeliveryBuilder({
        repository: repo,
        htmlBucket: bucket,
        assetsBucket: bucket,
        generator,
        ...(enhancePage ? { enhancePage } : {}),
    });

    const result = await builder.runOnce();
    if (result.changed) {
        console.log(`[delivery] tenant=${tenant.id} pages=${result.pagesUploaded} variants=${result.variantsUploaded} assets=${result.sharedAssetsUploaded}`);
    }

    // Sync the bucket's 404 fallback with whatever the CMS admin selected.
    // Skipped on no-op cycles to avoid hammering the bucket-settings endpoint.
    if (result.changed) {
        const system = await repo.getSystem();
        const notFoundPath = system?.site?.notFound?.path
            ? pageBucketName(system.site.notFound.path)
            : null;
        const patch = await bucket.updateBucketSettings({ notFoundPath });
        if (!patch.ok) {
            console.warn(`[delivery] tenant=${tenant.id} updateBucketSettings failed: ${patch.error.message}`);
        }
    }
}
