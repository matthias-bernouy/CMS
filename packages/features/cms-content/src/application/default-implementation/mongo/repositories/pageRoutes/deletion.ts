import type { Collection } from "mongodb";
import { PagePathUpdateConflictError, PageRevisionConflictError } from "cms-content/application/core/validation/errors";
import type {
    PageDeletionIntent,
    PageDoc,
    PageRouteDoc,
} from "cms-content/application/default-implementation/mongo/repositories/documents";

type Routes = Collection<PageRouteDoc>;
type Pages = Collection<PageDoc>;

/** Persist the decision before changing any route so startup can finish an interrupted deletion. */
export async function deleteMongoPage(
    pages: Pages,
    routes: Routes,
    id: string,
    alternativeId: string | null,
    expectedRevision?: number,
) {
    const original = await pages.findOne({ _id: id });
    if (!original) {
        return;
    }
    assertRevision(original, expectedRevision);
    if (original.pathUpdateIntent) {
        throw new PagePathUpdateConflictError();
    }
    if (original.deletionIntent && original.deletionIntent.alternativeId !== alternativeId) {
        throw new Error("Page deletion is already in progress with another alternative.");
    }
    await recoverMongoPageDeletions(pages, routes);
    const page = await pages.findOne({ _id: id });
    if (!page) {
        return;
    }
    assertRevision(page, expectedRevision);
    const alternative = alternativeId ? await pages.findOne({ _id: alternativeId }) : null;
    if (alternativeId && (!alternative || alternativeId === id || !alternative.visible || alternative.deletionIntent)) {
        throw new Error("Alternative must be another published page.");
    }
    const intent: PageDeletionIntent = {
        alternativeId,
        alternativePath: alternative?.path ?? null,
        requestedAt: new Date(),
    };
    const claimed = await pages.updateOne(
        {
            _id: id,
            deletionIntent: { $exists: false },
            pathUpdateIntent: { $exists: false },
            ...(expectedRevision === undefined ? {} : { revision: expectedRevision }),
        },
        { $set: { deletionIntent: intent } },
    );
    if (!claimed.matchedCount) {
        const concurrent = await pages.findOne({ _id: id });
        if (!concurrent) {
            return;
        }
        assertRevision(concurrent, expectedRevision);
        if (concurrent.pathUpdateIntent) {
            throw new PagePathUpdateConflictError();
        }
        if (concurrent.deletionIntent?.alternativeId !== alternativeId) {
            throw new Error("Page deletion is already in progress with another alternative.");
        }
        await recoverMongoPageDeletions(pages, routes);
        return;
    }
    await finishPageDeletion(pages, routes, { ...page, deletionIntent: intent });
}

function assertRevision(page: PageDoc, expectedRevision?: number): void {
    const actualRevision = Number.isSafeInteger(page.revision) ? page.revision : 1;
    if (expectedRevision !== undefined && actualRevision !== expectedRevision) {
        throw new PageRevisionConflictError(expectedRevision, actualRevision);
    }
}

/** Run before page-path migration or new deletions; only the indexed pending pages are scanned. */
export async function recoverMongoPageDeletions(pages: Pages, routes: Routes): Promise<void> {
    const pending = await pages.find({ "deletionIntent.requestedAt": { $exists: true } }).toArray();
    const byId = new Map(pending.map((page) => [page._id, page]));
    const incoming = new Map(pending.map((page) => [page._id, 0]));
    for (const page of pending) {
        const target = page.deletionIntent?.alternativeId;
        if (target && incoming.has(target)) {
            incoming.set(target, incoming.get(target)! + 1);
        }
    }
    const ready = pending.filter((page) => incoming.get(page._id) === 0);
    let completed = 0;
    for (let index = 0; index < ready.length; index++) {
        const page = ready[index]!;
        await finishPageDeletion(pages, routes, page);
        completed++;
        const target = page.deletionIntent?.alternativeId;
        if (target && byId.has(target)) {
            const remaining = incoming.get(target)! - 1;
            incoming.set(target, remaining);
            if (remaining === 0) {
                ready.push(byId.get(target)!);
            }
        }
    }
    if (completed !== pending.length) {
        throw new Error("Page deletions contain a replacement cycle.");
    }
}

async function finishPageDeletion(pages: Pages, routes: Routes, page: PageDoc): Promise<void> {
    const intent = page.deletionIntent;
    if (!intent) {
        throw new Error("Missing page deletion intent.");
    }
    const targetId = await resolveReplacement(pages, routes, page._id, intent);
    await routes.updateMany(
        { pageId: page._id },
        { $set: { state: targetId ? "redirect" : "gone", pageId: targetId ?? page._id } },
    );
    await pages.deleteOne({ _id: page._id, "deletionIntent.requestedAt": intent.requestedAt });
}

async function resolveReplacement(
    pages: Pages,
    routes: Routes,
    sourceId: string,
    intent: PageDeletionIntent,
): Promise<string | null> {
    if (!intent.alternativeId) {
        return null;
    }
    if (await pages.findOne({ _id: intent.alternativeId })) {
        return intent.alternativeId;
    }
    const route = intent.alternativePath ? await routes.findOne({ _id: intent.alternativePath }) : null;
    if (route?.state === "gone") {
        return null;
    }
    if (route?.state !== "redirect" || route.pageId === sourceId || !(await pages.findOne({ _id: route.pageId }))) {
        throw new Error("Page replacement cannot be resolved during deletion recovery.");
    }
    return route.pageId;
}
