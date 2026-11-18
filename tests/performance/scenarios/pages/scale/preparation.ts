import { fixturePage } from "../client";
import { assertCondition } from "../../queries/types";
import type { PageClient } from "../client";

export type PagePreparation = Readonly<{
    history?: number;
    contentBytes?: number;
    invalidate?: boolean;
    foreign?: PageClient;
    invalid?: (input: Readonly<Record<string, unknown>>) => Promise<void>;
}>;

/** Workload dimensions and all state changes are prepared before client timing. */
export async function preparePageState(
    client: PageClient,
    capability: string,
    binding: string,
    path: string,
    title: string,
    options: PagePreparation,
) {
    const revisions = options.history ?? 0;
    const bytes = options.contentBytes ?? 0;
    assertCondition(
        Number.isSafeInteger(revisions) &&
            revisions >= 0 &&
            revisions <= 32 &&
            Number.isSafeInteger(bytes) &&
            bytes >= 0 &&
            bytes <= 256 * 1024,
        "page-scale-workload-bound",
    );
    assertCondition(!options.invalidate || capability === "pages.get", "page-scale-invalidation-target");
    const content = bytes
        ? `<div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">${"x".repeat(bytes)}</p></div>`
        : undefined;
    const creation = { path, title, ...(content ? { content } : {}) };
    let page = capability === "pages.create" ? null : await fixturePage(client, "pages.create", creation);
    const marker = `Current ${title}`;
    try {
        for (let index = 0; page && index < revisions; index++) {
            const before = page;
            page = await fixturePage(client, "pages.update", {
                id: before.id,
                expectedRevision: before.revision,
                description: `Previous controlled revision ${index}`,
            });
            assertCondition(
                page.id === before.id && page.revision === Number(before.revision) + 1,
                "page-scale-prepared-history",
            );
        }
        if (options.invalidate) {
            const primed = await client("pages.get", binding, { id: page!.id });
            assertCondition(primed.observation.validated, "page-scale-prime-failed");
            const before = page!;
            page = await fixturePage(client, "pages.update", {
                id: before.id,
                expectedRevision: before.revision,
                description: marker,
            });
            assertCondition(
                page.id === before.id && page.revision === Number(before.revision) + 1,
                "page-scale-prepared-invalidation",
            );
        }
        return { page, content, creation, marker };
    } catch (error) {
        if (page?.id) {
            const current = await fixturePage(client, "pages.get", { id: page.id });
            assertCondition(
                current.id === page.id && current.title === title,
                "page-scale-preparation-cleanup-identity",
            );
            await fixturePage(client, "pages.delete", { id: current.id, expectedRevision: current.revision });
        }
        throw error;
    }
}
