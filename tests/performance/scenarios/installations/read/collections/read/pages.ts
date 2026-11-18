import { assertCondition, requireRecord } from "../../../../queries/types";
import { assertCollectionPage, collectionRows } from "./metadata";
import type { CollectionReadState } from "../context/types";

export async function collectionPageInput(
    state: CollectionReadState,
    history: boolean,
    profile: string,
    sample: number,
) {
    const rows = collectionRows(state, history);
    const own = rows.filter((row) => row.namespace === state.namespace);
    const selected = history
        ? rows[profile === "invalidation" ? 0 : (sample % 3) * 16]!
        : own[profile === "large" ? (sample % 4) * 16 : 0]!;
    assertCondition(selected, "collection-read-nonempty-timed-page");
    const position = rows.findIndex((row) => row.digest === selected.digest);
    const offset = Math.floor(position / 16) * 16;
    const capability = history ? "list-collection-releases" : "list-collection-catalogue";
    const input = {
        channel: "stable",
        limit: 16,
        ...(history
            ? { repositoryId: state.repositoryId, publisherId: state.namespace, collectionId: state.resources[0]!.id }
            : {}),
    };
    let cursor: string | undefined;
    for (let at = 0; at < offset; at += 16) {
        const result = await state.tenant.client(
            "ulvia/cms.installations",
            capability,
            "http",
            { ...input, ...(cursor ? { cursor } : {}) },
            (output) => assertCollectionPage(output, state, history, at, 16),
        );
        assertCondition(result.observation.validated, "collection-read-cursor-navigation");
        cursor = String(requireRecord(result.output).nextCursor);
        assertCondition(cursor.length > 0, "collection-read-cursor-before-owned-row");
    }
    return { offset, input: { ...input, ...(cursor ? { cursor } : {}) } };
}

export async function verifyCollectionPages(state: CollectionReadState, history: boolean) {
    let cursor: string | undefined;
    let offset = 0;
    const seen = new Set<string>();
    for (let page = 0; page < 32; page++) {
        const input = {
            channel: "stable",
            limit: 16,
            ...(history
                ? {
                      repositoryId: state.repositoryId,
                      publisherId: state.namespace,
                      collectionId: state.resources[0]!.id,
                  }
                : {}),
            ...(cursor ? { cursor } : {}),
        };
        const result = await state.tenant.client(
            "ulvia/cms.installations",
            history ? "list-collection-releases" : "list-collection-catalogue",
            "http",
            input,
            (output) => assertCollectionPage(output, state, history, offset, 16),
        );
        assertCondition(result.observation.validated, "collection-read-complete-pagination");
        const row = requireRecord(result.output);
        offset += (row.releases as readonly unknown[]).length;
        cursor = String(row.nextCursor);
        if (!cursor) {
            assertCondition(offset === collectionRows(state, history).length, "collection-read-all-pages-count");
            return;
        }
        assertCondition(!seen.has(cursor), "collection-read-repeated-cursor");
        seen.add(cursor);
    }
    assertCondition(false, "collection-read-page-bound");
}
