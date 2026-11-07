import { createCmsPage, publishCmsPage, readSystemSnapshot } from "@bernouy/content";
import type { ContentRepository } from "@bernouy/content";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { CollectionInitializationPlan } from "../interfaces";
import { collectionExampleDocument } from "../../../core/validation/examples/document";
import { initializationError } from "./state";

export interface InitializationPageProgress {
    readonly pageIds: Readonly<Record<string, string>>;
    readonly completedPages: readonly string[];
    checkpoint(pageIds: Readonly<Record<string, string>>, completedPages: readonly string[]): Promise<void>;
    assertLease(): Promise<void>;
}

/** Shared by disposable preflight and durable execution; every Page uses ordinary Content writes. */
export async function applyInitializationPages(
    repository: ContentRepository,
    plan: CollectionInitializationPlan,
    releases: readonly CollectionRelease[],
    progress: InitializationPageProgress,
): Promise<void> {
    const pageIds = { ...progress.pageIds };
    const completed = new Set(progress.completedPages);
    for (const seed of plan.pages) {
        await progress.assertLease();
        let page = pageIds[seed.receiptId]
            ? await repository.getPageById(pageIds[seed.receiptId]!)
            : await repository.getPage(seed.path);
        if (!pageIds[seed.receiptId] && page && (page.content !== "" || page.title !== seed.title || page.visible)) {
            throw initializationError("An unexpected Page owns a reserved initialization route", 409);
        }
        if (pageIds[seed.receiptId] && !page) {
            throw initializationError("An initialized Page was removed", 409);
        }
        if (!page) {
            const created = await createCmsPage(repository, { path: seed.path, title: seed.title });
            page = await repository.getPageById(created.id);
        }
        if (!page || page.path !== seed.path) {
            throw initializationError("Initialization Page identity changed", 409);
        }
        pageIds[seed.receiptId] = page.id;
        await progress.assertLease();
        await progress.checkpoint(pageIds, [...completed]);
    }
    // All draft routes now exist, so ordinary link validation can resolve cross-Page references.
    for (const seed of plan.pages) {
        await progress.assertLease();
        if (completed.has(seed.receiptId)) {
            continue;
        }
        const release = releases.find(({ collectionId }) => collectionId === seed.owner.collectionId);
        if (!release) {
            throw initializationError("Initialized collection is unavailable", 409);
        }
        const content = collectionExampleDocument(release, seed.exampleId, releases).html;
        const current = await repository.getPageById(pageIds[seed.receiptId]!);
        if (!current || (current.content !== "" && current.content !== content) || current.title !== seed.title) {
            throw initializationError("An initialized Page was changed before completion", 409);
        }
        const page = await repository.updatePage(
            { id: current.id, content, description: seed.description, indexing: { enabled: seed.indexing } },
            current.revision,
        );
        if (!page) {
            throw initializationError("Initialized Page disappeared", 409);
        }
        await progress.assertLease();
        if (page.visible !== seed.visible) {
            await publishCmsPage(repository, { id: page.id, expectedRevision: page.revision, visible: seed.visible });
        }
        if (seed.systemRole === "login") {
            const snapshot = await readSystemSnapshot(repository);
            if (snapshot.system.site.login !== null && snapshot.system.site.login.pageId !== page.id) {
                throw initializationError("Another Page owns the login role", 409);
            }
            if (snapshot.system.site.login === null) {
                await progress.assertLease();
                await repository.updateSystem(
                    { site: { ...snapshot.system.site, login: { pageId: page.id } } },
                    snapshot.revision,
                );
            }
        }
        completed.add(seed.receiptId);
        await progress.assertLease();
        await progress.checkpoint(pageIds, [...completed]);
    }
}
