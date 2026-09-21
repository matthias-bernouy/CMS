import type { Collection } from "mongodb";
import { pagePathsForSystem, planPagePaths } from "cms-content/core/lifecycle/pagePaths";
import type { TSystem } from "cms-content/interfaces/settings";
import {
    fromPageDoc,
    type PageDoc,
    type PageRouteDoc,
} from "cms-content/default-implementation/repositories/mongo/documents";
import { releasePagePathClaim } from "./updates";

/** A route created before its page is either completed or released on startup. */
export async function recoverMongoPageInserts(
    pages: Collection<PageDoc>,
    routes: Collection<PageRouteDoc>,
): Promise<void> {
    const pending = await routes.find({ pageInsertToken: { $exists: true } }).toArray();
    for (const route of pending) {
        if (await pages.findOne({ _id: route.pageId })) {
            await routes.updateOne(
                { _id: route._id, pageInsertToken: route.pageInsertToken },
                { $set: {}, $unset: { pageInsertToken: "" } },
            );
        } else {
            await routes.deleteOne({ _id: route._id, pageInsertToken: route.pageInsertToken });
        }
    }
}

/** Restore the saved page as authority after an interrupted path update. */
export async function recoverMongoPagePathUpdates(
    pages: Collection<PageDoc>,
    routes: Collection<PageRouteDoc>,
    system: TSystem,
): Promise<void> {
    const pending = await pages.find({ "pathUpdateIntent.requestedAt": { $exists: true } }).toArray();
    for (const page of pending) {
        const intent = page.pathUpdateIntent!;
        const added = await routes.find({ pathUpdateToken: intent.token }).toArray();
        if (intent.phase === "committed") {
            const saved = fromPageDoc(page)!;
            const currentPaths = new Set(
                planPagePaths(page.paths ?? pagePathsForSystem(saved, system), system).current.map(({ path }) => path),
            );
            const previous = await routes.find({ pageId: page._id, state: "current" }).toArray();
            for (const route of previous) {
                if (!currentPaths.has(route._id)) {
                    await routes.updateOne(
                        { _id: route._id, pageId: page._id, state: "current" },
                        { $set: { state: "redirect" } },
                    );
                }
            }
        }
        for (const route of added) {
            if (intent.phase === "committed") {
                await routes.updateOne(
                    { _id: route._id, pathUpdateToken: intent.token },
                    { $set: {}, $unset: { pathUpdateToken: "" } },
                );
            } else {
                await routes.deleteOne({ _id: route._id, pathUpdateToken: intent.token });
            }
        }
        await releasePagePathClaim(pages, page._id, intent.token);
    }
}
