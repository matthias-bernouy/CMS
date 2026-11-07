import { canonicalIJsonBytes } from "cms-repository/exports/contracts/protocol";
import type { InitializationRecord, InitializationServiceOptions } from "./interfaces";
import { initializationDigest } from "../planning/plan";

export function pendingInitialization(siteId: string): InitializationRecord {
    return {
        protocol: "ulvia-site-initialization/v1",
        siteId,
        revision: 0,
        status: "pending",
        review: null,
        pageIds: {},
        completedPages: [],
    };
}

export function validateInitializationRecord(value: InitializationRecord): void {
    if (
        canonicalIJsonBytes(value, 64).byteLength > 8 * 1024 * 1024 ||
        value.protocol !== "ulvia-site-initialization/v1" ||
        !value.siteId ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 0 ||
        !["pending", "running", "completed"].includes(value.status) ||
        !value.pageIds ||
        !Array.isArray(value.completedPages) ||
        Object.keys(value.pageIds).length > 256 ||
        value.completedPages.length > 256 ||
        (value.status === "pending" ? value.review !== null : !value.review)
    ) {
        throw new Error("Invalid persisted initialization state");
    }
    if (value.review) {
        const { digest, ...evidence } = value.review;
        const { digest: planDigest, ...plan } = value.review.plan;
        const receipts = new Set(value.review.plan.pages.map(({ receiptId }) => receiptId));
        if (
            digest !== initializationDigest(evidence) ||
            planDigest !== initializationDigest(plan) ||
            value.review.siteId !== value.siteId ||
            !value.review.actorId ||
            !value.review.instanceId ||
            Object.entries(value.pageIds).some(
                ([key, id]) => !receipts.has(key) || typeof id !== "string" || !id || id.length > 256,
            ) ||
            value.completedPages.some((id) => !value.pageIds[id]) ||
            new Set(value.completedPages).size !== value.completedPages.length ||
            (value.status === "completed" && value.completedPages.length !== receipts.size)
        ) {
            throw new Error("Invalid persisted initialization evidence");
        }
    } else if (Object.keys(value.pageIds).length || value.completedPages.length) {
        throw new Error("Pending initialization contains unexpected Page receipts");
    }
}

export async function assertInitializationRoutesAvailable(
    options: InitializationServiceOptions,
    paths: readonly string[],
) {
    if (!paths.length) {
        return;
    }
    if (options.repository.getPageRoutes) {
        if ((await options.repository.getPageRoutes(paths)).length) {
            throw initializationError("An initialization route is already reserved", 409);
        }
    } else {
        for (const path of paths) {
            if (await options.repository.getPageRoute(path)) {
                throw initializationError("An initialization route is already reserved", 409);
            }
        }
    }
}

export async function readInitialization(options: InitializationServiceOptions): Promise<InitializationRecord> {
    const state = await options.state.read(options.siteId);
    if (!state) {
        throw initializationError("Initialization is not configured for this instance", 409);
    }
    validateInitializationRecord(state);
    if (state.siteId !== options.siteId) {
        throw initializationError("Initialization scope mismatch", 409);
    }
    return state;
}

/** Bounded existence reads; an empty site is a prerequisite, never an initialization marker. */
export async function assertEmptyInitialization(options: InitializationServiceOptions) {
    const [pages, blocs, collections, systemRevision] = await Promise.all([
        options.repository.scanPages(undefined, 1),
        options.repository.getSiteBlocsRevision?.(),
        options.collections.listInstalled(options.siteId),
        options.repository.getSystemRevision(),
    ]);
    if (pages.pages.length || collections.items.length) {
        throw initializationError("Initialization requires an empty site; existing content will not be replaced", 409);
    }
    return { systemRevision, collectionRevision: collections.revision, siteBlocsRevision: blocs ?? null };
}

export function initializationError(message: string, status = 422): Error {
    return Object.assign(new Error(message), { status });
}
