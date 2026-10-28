import { createCmsPage, publishCmsPage, readSystemSnapshot } from "@bernouy/cms-content";
import { collectionExampleDocument, resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { OfficialInstanceProfile, ProviderInstanceTransitionExecution } from "@bernouy/ulvia-provider";
import type { InstanceComposition } from "../composition/ProviderInstanceHost";

/** Receipts belong to provisioning, never to the Page document. */
export async function seedOfficialPages(
    composition: InstanceComposition,
    profile: OfficialInstanceProfile,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    const { repo, db, collections } = composition.stores;
    const receipts = db.collection<{ _id: string; pageId?: string; completed: boolean }>("cms_initial_page_receipts");
    const snapshot = await collections.snapshot("default");
    const release = snapshot.collections.find((item) => item.digest === profile.collection.digest)?.release;
    if (!release) {
        throw new Error("The exact initial Page collection is not installed");
    }
    const pending: { seed: OfficialInstanceProfile["initialPages"][number]; key: string; pageId: string }[] = [];
    // Reserve all ordinary draft routes before validating links between their documents.
    for (const seed of profile.initialPages) {
        execution.throwIfLeaseLost();
        const key = `${profile.id}:${seed.id}`;
        const receipt = await receipts.findOne({ _id: key });
        if (receipt?.completed) {
            continue;
        }
        let page = receipt?.pageId ? await repo.getPageById(receipt.pageId) : await repo.getPage(seed.path);
        if (!receipt) {
            if (page) {
                throw new Error(`An existing Page already owns the initial path: ${seed.path}`);
            }
            await receipts.insertOne({ _id: key, completed: false });
        } else if (receipt.pageId && !page) {
            throw new Error("An initialized Page was removed before provisioning completed");
        }
        if (!page) {
            execution.throwIfLeaseLost();
            const created = await createCmsPage(repo, {
                path: seed.path,
                title: resolveCollectionTranslation(release, seed.title, release.locale),
            });
            page = await repo.getPageById(created.id);
            if (!page) {
                throw new Error("Initial Page was not persisted");
            }
        }
        execution.throwIfLeaseLost();
        await receipts.updateOne({ _id: key, completed: false }, { $set: { pageId: page.id } });
        pending.push({ seed, key, pageId: page.id });
    }
    for (const { seed, key, pageId } of pending) {
        execution.throwIfLeaseLost();
        const current = await repo.getPageById(pageId);
        if (!current) {
            throw new Error("An initialized Page was removed before provisioning completed");
        }
        const document = collectionExampleDocument(
            release,
            seed.exampleId,
            snapshot.collections.map((item) => item.release),
        );
        // Every incomplete receipt repeats the full initialization, including after a partial write.
        const page = await repo.updatePage(
            {
                id: current.id,
                content: document.html,
                description: resolveCollectionTranslation(release, seed.description, release.locale),
                indexing: { enabled: false },
            },
            current.revision,
        );
        if (!page) {
            throw new Error("Initial Page disappeared");
        }
        execution.throwIfLeaseLost();
        if (!page.visible) {
            await publishCmsPage(repo, { id: page.id, expectedRevision: page.revision, visible: true });
        }
        if (seed.id === "login") {
            const { revision, system } = await readSystemSnapshot(repo);
            if (system.site.login === null) {
                await repo.updateSystem({ site: { login: { kind: "site", pageId: page.id } } as never }, revision);
            }
        }
        execution.throwIfLeaseLost();
        await receipts.updateOne({ _id: key, completed: false }, { $set: { completed: true }, $unset: { pageId: "" } });
    }
}
