import type { CDN } from "@bernouy/socle";
import type { TPage } from "src/socle/interfaces/models";
import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import type { HeadInjector } from "src/delivery/interfaces/HeadInjector";
import type { VariantGenerator } from "src/delivery/interfaces/VariantGenerator";
import type { VariantSpec } from "src/delivery/interfaces/VariantSpec";
import { variantSpecKey } from "src/delivery/interfaces/VariantSpec";
import type { DeployManifest, DeployedPage } from "src/delivery/interfaces/DeployManifest";
import type { EnhancementPlan } from "src/delivery/core/enhance/planEnhancement";
import { rewriteHTML } from "src/delivery/core/enhance/rewriteHTML";
import { renderPage } from "src/delivery/core/html/renderPage";
import type { RenderContext } from "src/delivery/core/html/RenderContext";
import { sha256Hex } from "src/delivery/build/sha256";
import { computeRepoStateHash } from "src/delivery/build/repoStateHash";
import { createBuildAssetsContext, type BuildAssetsContext } from "src/delivery/build/buildAssets";
import {
    loadManifest, uploadManifest, uploadVariant, uploadHtml, deleteOrphanPages, gcOrphanAssets,
} from "src/delivery/build/cdnIO";

export type DeliveryBuilderDeps = {
    repository: DeliveryRepository;
    /** Bucket that serves rendered HTML (short cache, public URL = page path). */
    htmlBucket: CDN;
    /** Bucket that serves hashed assets (long-cache immutable, dedup-by-name). */
    assetsBucket: CDN;
    generator: VariantGenerator;
    /** Optional — runs Playwright-based image measurement + plan. When
     *  absent, pages ship as-rendered (no srcset, no loading hints). */
    enhancePage?: (path: string, html: string) => Promise<EnhancementPlan>;
    /** Pass-through to `renderPage` so consumers can inject `<head>` content
     *  (analytics, observability tags). */
    headInjectors?: readonly HeadInjector[];
    /** Default `true`. Set to `false` to skip the orphan-asset GC step at
     *  the end of `runOnce` (useful in shared buckets or when running with
     *  a second writer). */
    gcAssets?: boolean;
    /** Override `fetch` for manifest retrieval. Tests inject one that
     *  resolves URLs back to in-memory buckets. */
    fetcher?: typeof fetch;
    /** Override factory for the per-cycle assets context. Production uses
     *  `createBuildAssetsContext` (default); tests inject a stub so they
     *  don't pay the `Bun.build` cost of compiling the component runtime. */
    createAssetsContext?: (assetsBucket: CDN, repository: DeliveryRepository) => Promise<BuildAssetsContext>;
};

export type RunOnceResult = {
    /** False when the repo fingerprint matched the previous deploy and the
     *  cycle bailed before doing any work. */
    changed: boolean;
    pagesUploaded: number;
    variantsUploaded: number;
    sharedAssetsUploaded: number;
    pagesDeleted: number;
    assetsDeleted: number;
};

/**
 * Orchestrates one build-and-deploy cycle. Reads pages from the repository,
 * renders each through the standard `renderPage` pipeline (with a build-mode
 * `RenderContext` that uploads assets to the CDN), runs the optional
 * enhancement plan, materializes image variants, uploads everything to the
 * CDN, and commits a new `_manifest.json` last.
 *
 * Atomicity rules — assets uploaded BEFORE HTML so a fresh page can't
 * reference a variant or shared asset that isn't reachable yet; manifest
 * written LAST so an interrupted cycle leaves the previous manifest in
 * place and the next `runOnce()` re-enters cleanly.
 *
 * Idempotency — re-running with no repo change short-circuits via
 * `repoStateHash`; per-page upload is skipped when the post-enhancement
 * `htmlHash` matches the manifest entry; per-asset upload is skipped at
 * the bucket level (`overwrite: false` + conflict swallow).
 */
export class DeliveryBuilder {
    constructor(private _deps: DeliveryBuilderDeps) {}

    async runOnce(): Promise<RunOnceResult> {
        const oldManifest   = await loadManifest(this._deps.htmlBucket, this._deps.fetcher);
        const pages         = await this._deps.repository.getAllPages();
        const repoStateHash = await computeRepoStateHash(this._deps.repository, pages);

        if (oldManifest && oldManifest.repoStateHash === repoStateHash) {
            return {
                changed: false, pagesUploaded: 0, variantsUploaded: 0,
                sharedAssetsUploaded: 0, pagesDeleted: 0, assetsDeleted: 0,
            };
        }

        const buildAssets = await (this._deps.createAssetsContext ?? createBuildAssetsContext)(
            this._deps.assetsBucket, this._deps.repository,
        );
        const ctx: RenderContext = {
            repository: this._deps.repository,
            resolveAssets: buildAssets.resolveAssets,
            defaultFaviconUrl: buildAssets.faviconUrl,
            headInjectors: this._deps.headInjectors ?? [],
        };

        const pageWorks = await this._renderAndPlan(pages, ctx);
        const { variantUrlByKey, variantHashByKey, variantsUploaded } =
            await this._uploadVariants(pageWorks);

        const { newPages, pagesUploaded } =
            await this._uploadPages(pageWorks, variantUrlByKey, variantHashByKey, oldManifest);

        const currentPaths = new Set(pages.map(p => p.path));
        const pagesDeleted = oldManifest
            ? await deleteOrphanPages(this._deps.htmlBucket, currentPaths, oldManifest)
            : 0;

        const sharedAssets = buildAssets.sharedAssetHashes();
        await uploadManifest(this._deps.htmlBucket, {
            version: 1,
            pages: newPages,
            sharedAssets,
            repoStateHash,
            generatedAt: new Date().toISOString(),
        });

        let assetsDeleted = 0;
        if (this._deps.gcAssets !== false) {
            const liveHashes = new Set<string>();
            for (const p of Object.values(newPages)) for (const h of p.assetRefs) liveHashes.add(h);
            for (const h of Object.values(sharedAssets)) liveHashes.add(h);
            try {
                assetsDeleted = await gcOrphanAssets(this._deps.assetsBucket, liveHashes);
            } catch (err) {
                console.error("[DeliveryBuilder] orphan asset GC failed:", err);
            }
        }

        return {
            changed: true,
            pagesUploaded,
            variantsUploaded,
            sharedAssetsUploaded: buildAssets.freshUploads(),
            pagesDeleted,
            assetsDeleted,
        };
    }

    private async _renderAndPlan(
        pages: readonly TPage[],
        ctx: RenderContext,
    ): Promise<PageWork[]> {
        const out: PageWork[] = [];
        for (const page of pages) {
            const entry = await renderPage(page, ctx);
            const html  = new TextDecoder().decode(entry.raw);
            const plan: EnhancementPlan = this._deps.enhancePage
                ? await this._deps.enhancePage(page.path, html)
                : { rewrites: [], variantsNeeded: [] };
            out.push({ page, html, plan });
        }
        return out;
    }

    private async _uploadVariants(works: readonly PageWork[]) {
        const variants = new Map<string, VariantSpec>();
        for (const { plan } of works) {
            for (const v of plan.variantsNeeded) {
                const k = variantSpecKey(v);
                if (!variants.has(k)) variants.set(k, v);
            }
        }

        const variantHashByKey = new Map<string, string>();
        const variantUrlByKey  = new Map<string, string>();
        let variantsUploaded = 0;

        for (const [k, spec] of variants) {
            const generated = await this._deps.generator.generate(spec);
            variantHashByKey.set(k, generated.hash);
            const { absoluteURL, fresh } = await uploadVariant(this._deps.assetsBucket, generated);
            variantUrlByKey.set(k, absoluteURL);
            if (fresh) variantsUploaded++;
        }

        return { variantUrlByKey, variantHashByKey, variantsUploaded };
    }

    private async _uploadPages(
        works: readonly PageWork[],
        variantUrlByKey:  ReadonlyMap<string, string>,
        variantHashByKey: ReadonlyMap<string, string>,
        oldManifest: DeployManifest | null,
    ): Promise<{ newPages: Record<string, DeployedPage>; pagesUploaded: number }> {
        const newPages: Record<string, DeployedPage> = {};
        let pagesUploaded = 0;

        for (const { page, html, plan } of works) {
            const finalHtml = plan.rewrites.length > 0
                ? rewriteHTML(html, plan.rewrites, (src, w) =>
                    variantUrlByKey.get(variantSpecKey({ originalUrl: src, width: w })) ?? src)
                : html;
            const htmlHash = await sha256Hex(finalHtml);

            const existing = oldManifest?.pages[page.path];
            if (!existing || existing.htmlHash !== htmlHash) {
                await uploadHtml(this._deps.htmlBucket, page.path, finalHtml);
                pagesUploaded++;
            }

            newPages[page.path] = {
                htmlHash,
                assetRefs: plan.variantsNeeded
                    .map(v => variantHashByKey.get(variantSpecKey(v)))
                    .filter((h): h is string => h !== undefined),
            };
        }

        return { newPages, pagesUploaded };
    }
}

type PageWork = { page: TPage; html: string; plan: EnhancementPlan };
// `BuildAssetsContext` is re-exported here so tests can mock it without
// importing from a deeper file.
export type { BuildAssetsContext };
