import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { fixturePage } from "../client";
import { pageScaleDataset } from "../scale/dataset";
import { assertCondition } from "../../queries/types";
import type { PageClient } from "../client";
import type { PageRow } from "./oracle";

export function pageReadDataset(client: PageClient, origin: string, gone?: (path: string) => Promise<void>) {
    const receipts = new Map<string, Readonly<Record<string, unknown>>>();
    const recorded: PageClient = async (capability, binding, input, assert) => {
        const result = await client(capability, binding, input, assert);
        if (result.observation.validated && result.output && typeof result.output.id === "string") {
            const { id } = result.output;
            if (capability === "pages.delete") {
                receipts.delete(id);
            } else if (["pages.create", "pages.update-route", "pages.rename"].includes(capability)) {
                receipts.set(id, { ...receipts.get(id), ...structuredClone(result.output) });
            }
        }
        return result;
    };
    const dataset = pageScaleDataset(recorded, origin, gone);
    let anchor: Readonly<Record<string, unknown>> | undefined;
    let anchorAttempted = false;
    const title = `${dataset.marker}-999`;
    const path = `/${title}`;
    return {
        marker: dataset.marker,
        async initialize(variant: string) {
            if (variant !== "invalidation") {
                await dataset.initialize(variant === "history");
            }
            if (variant !== "large") {
                anchorAttempted = true;
                anchor = await fixturePage(recorded, "pages.create", { title, path });
            }
        },
        rows(): readonly PageRow[] {
            return [...receipts.values()]
                .map(({ id, path, title, visible }) => {
                    assertCondition(
                        typeof id === "string" &&
                            typeof path === "string" &&
                            typeof title === "string" &&
                            typeof visible === "boolean",
                        "page-list-command-receipt",
                    );
                    return { id, path, title, visible };
                })
                .sort((a, b) => a.title.localeCompare(b.title));
        },
        async invalidate(index: number) {
            assertCondition(anchor, "page-list-anchor-missing");
            const before = anchor;
            const nextTitle = `${title}-${index}`;
            anchor = await fixturePage(recorded, "pages.rename", {
                id: before.id,
                expectedRevision: before.revision,
                title: nextTitle,
            });
            assertCondition(
                anchor.id === before.id &&
                    anchor.revision === Number(before.revision) + 1 &&
                    anchor.title === nextTitle &&
                    anchor.path === before.path,
                "page-list-invalidation-command",
            );
        },
        async anchorState() {
            const representative = anchor ?? receipts.values().next().value;
            return representative
                ? canonicalizeIJson(await fixturePage(client, "pages.get", { id: representative.id }))
                : null;
        },
        async close() {
            try {
                if (anchorAttempted) {
                    // Resolve the exact owned path even if the creation receipt was lost.
                    const found = await fixturePage(client, "pages.list", { query: dataset.marker, limit: 100 });
                    assertCondition(Array.isArray(found.items) && found.items.length <= 1, "page-list-anchor-cleanup");
                    for (const item of found.items) {
                        assertCondition(
                            item.path === path && String(item.title).startsWith(title),
                            "page-list-anchor-owner",
                        );
                        const current = await fixturePage(client, "pages.get", { id: item.id });
                        await fixturePage(recorded, "pages.delete", {
                            id: item.id,
                            expectedRevision: current.revision,
                        });
                    }
                    anchor = undefined;
                    anchorAttempted = false;
                }
            } finally {
                await dataset.close();
            }
        },
    };
}

export type PageReadDataset = ReturnType<typeof pageReadDataset>;
