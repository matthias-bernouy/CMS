import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { initializationDigest } from "../planning/plan";
import type { InitializationRecord, InitializationReview, InitializationServiceOptions } from "./interfaces";
import { readInitialization, initializationError, validateInitializationRecord } from "./state";
import { prepareInitialization } from "./review";
import { executeInitialization } from "./apply";
import { discoverInitializationRecipes } from "./discovery";

export class SiteInitializationService {
    private busy = false;
    readonly siteId: string;
    constructor(private readonly options: InitializationServiceOptions) {
        this.siteId = options.siteId;
    }
    async entry() {
        const state = await this.options.state.read(this.siteId);
        if (state) {
            validateInitializationRecord(state);
            if (state.siteId !== this.siteId) {
                throw initializationError("Initialization scope mismatch", 409);
            }
        }
        return { pending: !!state && (state.status !== "completed" || (await this.completionPending(state))) };
    }
    async status() {
        const state = await this.options.state.read(this.siteId);
        if (!state) {
            return {
                status: "unavailable" as const,
                revision: 0,
                completedPages: 0,
                totalPages: 0,
                planDigest: "",
                rootJson: "null",
                locale: "en",
                redirectPath: "",
            };
        }
        validateInitializationRecord(state);
        if (state.siteId !== this.siteId) {
            throw initializationError("Initialization scope mismatch", 409);
        }
        let review = state.review;
        let prepared = false;
        if (state.status === "pending") {
            const active = await this.options.upgrades.getActive(this.siteId);
            if (active?.kind === "initialization") {
                const intent = await this.options.upgrades.get<InitializationReview>(
                    this.siteId,
                    active.id,
                    "initialization",
                );
                if (
                    !intent ||
                    intent.payload.instanceId !== this.options.instanceId ||
                    intent.payload.siteId !== this.siteId
                ) {
                    throw initializationError("Initialization intent scope mismatch", 409);
                }
                review = intent.payload;
                validateInitializationRecord({ ...state, status: "running", review });
                prepared = true;
            }
        }
        const status =
            state.status === "completed" && (await this.completionPending(state))
                ? "running"
                : prepared
                  ? "running"
                  : state.status;
        return {
            status,
            revision: state.revision,
            completedPages: state.completedPages.length,
            totalPages: review?.plan.pages.length ?? 0,
            planDigest: review?.digest ?? "",
            rootJson: canonicalizeIJson(review?.plan.root ?? null),
            locale: review?.plan.locale ?? "en",
            redirectPath: status === "completed" ? redirectPath(review!) : "",
        };
    }
    async list(cursor?: string, locale?: string) {
        const state = await readInitialization(this.options);
        if (state.status !== "pending") {
            throw initializationError("Initialization was already started", 409);
        }
        return this.exclusive(() => discoverInitializationRecipes(this.options.source, cursor, locale));
    }
    plan(actorId: string, root: unknown, locale?: string, signal?: AbortSignal) {
        return this.exclusive(
            async () => (await prepareInitialization(this.options, actorId, root, locale, signal)).review,
        );
    }
    apply(
        actorId: string,
        root: unknown,
        planDigest: string,
        locale?: string,
        guard?: { readonly signal: AbortSignal; assertHeld(): void },
    ) {
        return this.exclusive(async () => {
            const assertExecution = () => {
                guard?.signal.throwIfAborted();
                guard?.assertHeld();
            };
            assertExecution();
            const existing = await this.options.upgrades.get<InitializationReview>(
                this.siteId,
                planDigest,
                "initialization",
            );
            let review: InitializationReview;
            if (existing) {
                review = existing.payload;
                if (
                    review.actorId !== actorId ||
                    review.instanceId !== this.options.instanceId ||
                    review.siteId !== this.siteId ||
                    canonicalizeIJson(review.plan.root) !== canonicalizeIJson(root) ||
                    (locale !== undefined && review.plan.locale !== locale)
                ) {
                    throw initializationError("Initialization retry changed its reviewed scope", 409);
                }
            } else {
                const prepared = await prepareInitialization(this.options, actorId, root, locale, guard?.signal);
                review = prepared.review;
                if (review.digest !== planDigest) {
                    throw initializationError("Initialization review is stale", 409);
                }
                for (const artifact of prepared.artifacts) {
                    assertExecution();
                    await this.options.collections.importAdmittedRelease(artifact);
                }
                assertExecution();
                await this.options.upgrades.begin({
                    id: planDigest,
                    siteId: this.siteId,
                    kind: "initialization",
                    planDigest,
                    expectedRevision: review.collectionRevision,
                    sourceStateDigest: initializationDigest({ pending: true }),
                    targetStateDigest: initializationDigest({ completed: true, planDigest }),
                    payload: review,
                    status: "prepared",
                    createdAt: new Date().toISOString(),
                });
            }
            await executeInitialization(this.options, review, assertExecution);
            return this.status();
        });
    }
    private async completionPending(state: InitializationRecord) {
        const active = await this.options.upgrades.getActive(this.siteId);
        return active?.kind === "initialization" && active.id === state.review?.digest;
    }
    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        if (this.busy) {
            throw initializationError("An initialization request is already being prepared", 423);
        }
        this.busy = true;
        try {
            return await operation();
        } finally {
            this.busy = false;
        }
    }
}

function redirectPath(review: InitializationReview) {
    const pages = review.plan.pages.filter(({ visible }) => visible);
    return (
        pages.find(({ path }) => path === "/")?.path ??
        pages.find(({ path }) => path === "/admin")?.path ??
        pages[0]?.path ??
        ""
    );
}
