import { randomUUIDv7 } from "bun";
import type { Collection } from "mongodb";
import type { PageRoute, TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import { pagePathsForSystem, type PlannedPagePaths } from "cms-content/core/lifecycle/pagePaths";
import {
    DuplicatePagePathError,
    PagePathUpdateConflictError,
    PagePathsStaleError,
} from "cms-content/core/validation/errors";
import {
    fromPageDoc,
    type PageDoc,
    type PageRouteDoc,
} from "cms-content/default-implementation/repositories/mongo/documents";

type Pages = Collection<PageDoc>;
type Routes = Collection<PageRouteDoc>;
type PreviousRoute = Pick<PageRouteDoc, "_id" | "state" | "language" | "ownerPageId">;

/** An atomic page claim keeps concurrent editors from interleaving route writes. */
export async function updateMongoPagePaths(
    pages: Pages,
    routes: Routes,
    id: string,
    plan: PlannedPagePaths,
    system: TSystem,
    expectedPaths?: Record<string, string>,
): Promise<TPage> {
    const token = randomUUIDv7();
    const claim = await pages.updateOne(
        { _id: id, deletionIntent: { $exists: false }, pathUpdateIntent: { $exists: false } },
        { $set: { pathUpdateIntent: { token, requestedAt: new Date(), phase: "preparing" } } },
    );
    if (!claim.matchedCount) {
        const existing = await pages.findOne({ _id: id });
        if (!existing) {
            throw new Error("Unknown page id.");
        }
        if (existing.deletionIntent) {
            throw new Error("Page deletion is in progress.");
        }
        throw new PagePathUpdateConflictError();
    }

    const modified: PreviousRoute[] = [];
    try {
        const stored = await pages.findOne({ _id: id, "pathUpdateIntent.token": token });
        if (!stored) {
            throw new PagePathUpdateConflictError();
        }
        const page = fromPageDoc(stored)!;
        if (expectedPaths && !samePagePaths(page.paths ?? pagePathsForSystem(page, system), expectedPaths)) {
            throw new PagePathsStaleError();
        }
        const current = await routes.find({ pageId: id, state: "current" }).toArray();
        for (const route of plan.current) {
            const match = await routes.findOne({ _id: route.path });
            if (match) {
                if (!canUsePageRoute(match, id)) {
                    throw new DuplicatePagePathError(route.path);
                }
                if (match.state === "redirect" || match.language !== route.language) {
                    modified.push(match);
                    await routes.updateOne(
                        { _id: route.path, pageId: id },
                        { $set: { state: "current", language: route.language, ownerPageId: id } },
                    );
                }
                continue;
            }
            try {
                await routes.insertOne({
                    _id: route.path,
                    state: "current",
                    pageId: id,
                    ownerPageId: id,
                    language: route.language,
                    pathUpdateToken: token,
                });
            } catch (error) {
                rethrowPagePathConflict(error, route.path);
            }
        }
        const saved = await pages.updateOne(
            { _id: id, "pathUpdateIntent.token": token, deletionIntent: { $exists: false } },
            { $set: { path: plan.primaryPath, paths: plan.paths, "pathUpdateIntent.phase": "committed" } },
        );
        if (!saved.matchedCount) {
            throw new PagePathUpdateConflictError();
        }
        for (const route of current) {
            if (plan.current.some(({ path }) => path === route._id)) {
                continue;
            }
            await routes.updateOne({ _id: route._id, pageId: id, state: "current" }, { $set: { state: "redirect" } });
        }
        await routes.updateMany({ pathUpdateToken: token }, { $set: {}, $unset: { pathUpdateToken: "" } });
        await releasePagePathClaim(pages, id, token);
        return { ...page, path: plan.primaryPath, paths: plan.paths };
    } catch (error) {
        const stored = await pages.findOne({ _id: id, "pathUpdateIntent.token": token });
        if (stored?.pathUpdateIntent?.phase !== "committed") {
            const added = await routes.find({ pathUpdateToken: token }).toArray();
            for (const route of added) {
                await routes.deleteOne({ _id: route._id, pageId: id, pathUpdateToken: token });
            }
            for (const route of modified.reverse()) {
                await routes.updateOne(
                    { _id: route._id, pageId: id },
                    {
                        $set: {
                            state: route.state,
                            language: route.language,
                            ...(route.ownerPageId ? { ownerPageId: route.ownerPageId } : {}),
                        },
                        ...(!route.ownerPageId ? { $unset: { ownerPageId: "" } } : {}),
                    },
                );
            }
            await releasePagePathClaim(pages, id, token);
        }
        rethrowPagePathConflict(error, plan.primaryPath);
    }
}

export async function releasePagePathClaim(pages: Pages, id: string, token: string): Promise<void> {
    const result = await pages.updateOne(
        { _id: id, "pathUpdateIntent.token": token },
        { $set: {}, $unset: { pathUpdateIntent: "" } },
    );
    if (!result.matchedCount) {
        throw new PagePathUpdateConflictError();
    }
}

export function canUsePageRoute(route: Pick<PageRoute, "pageId" | "ownerPageId" | "state">, pageId: string): boolean {
    return (
        route.pageId === pageId &&
        ((route.state === "current" && route.ownerPageId === pageId) ||
            (route.state === "redirect" && route.ownerPageId === pageId))
    );
}

export function rethrowPagePathConflict(error: unknown, path: string): never {
    if ((error as { code?: unknown } | null)?.code === 11000) {
        throw new DuplicatePagePathError(path);
    }
    throw error;
}

function samePagePaths(left: Record<string, string>, right: Record<string, string>): boolean {
    return (
        Object.keys(left).length === Object.keys(right).length &&
        Object.entries(right).every(([language, path]) => left[language] === path)
    );
}
