import { randomUUID } from "node:crypto";
import { fixturePage } from "../client";
import { assertCondition, requireRecord } from "../../queries/types";
import { isolatedOrigin, responseBytes } from "../../../harness/transport/http";
import type { PageClient } from "../client";

/** Real API writes retain 64 live Pages or 32 deleted Pages with four historical routes each. */
export function pageScaleDataset(
    client: PageClient,
    origin: string,
    gone = async (path: string) => {
        const response = await fetch(new URL(path, isolatedOrigin(origin)), {
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
        });
        await responseBytes(response, 512 * 1024);
        assertCondition(response.status === 410, "page-scale-gone-route-missing");
    },
) {
    const marker = `page-scale-${randomUUID()}`;
    const owned = new Map<string, { title: string; path: string }>();
    const pending = new Map<string, string>();
    const history: string[] = [];
    const list = async () => fixturePage(client, "pages.list", { query: marker, limit: 100 });
    const create = async (index: number) => {
        const title = `${marker}-${String(index).padStart(3, "0")}`;
        const path = `/${title}`;
        pending.set(title, path);
        const page = await fixturePage(client, "pages.create", { title, path });
        assertCondition(
            typeof page.id === "string" && page.title === title && page.path === path,
            "page-scale-created-identity",
        );
        owned.set(page.id, { title, path });
        pending.delete(title);
        return page;
    };
    const remove = async (id: string) => {
        const scope = owned.get(id)!;
        const current = await fixturePage(client, "pages.get", { id });
        assertCondition(current.id === id && current.title === scope.title, "page-scale-cleanup-identity");
        const deleted = await fixturePage(client, "pages.delete", { id, expectedRevision: current.revision });
        assertCondition(deleted.id === id && deleted.deleted === true, "page-scale-delete-failed");
        owned.delete(id);
    };
    return {
        marker,
        history,
        async initialize(retained: boolean) {
            const deadline = Date.now() + 180_000;
            const localization = retained ? await fixturePage(client, "localization.get", {}) : null;
            for (let index = 0; index < (retained ? 32 : 64); index++) {
                assertCondition(Date.now() <= deadline, "page-scale-preparation-deadline");
                let page = await create(index);
                if (retained) {
                    const first = String(page.path);
                    for (let revision = 0; revision < 3; revision++) {
                        page = await fixturePage(client, "pages.update-route", {
                            id: page.id,
                            expectedRevision: page.revision,
                            language: localization!.language,
                            path: `${first}-revision-${revision}`,
                        });
                    }
                    history.push(first, `${first}-revision-2`);
                    await remove(String(page.id));
                }
            }
            const listed = await list();
            assertCondition(Array.isArray(listed.items), "page-scale-page-list-missing");
            if (retained) {
                assertCondition(listed.items.length === 0, "page-scale-deleted-pages-returned");
                for (const path of history) {
                    assertCondition(Date.now() <= deadline, "page-scale-history-probe-deadline");
                    await gone(path);
                }
            } else {
                assertCondition(listed.items.length === 64 && !listed.nextCursor, "page-scale-page-count");
                const ids = new Set(listed.items.map((value) => requireRecord(value).id));
                assertCondition(
                    ids.size === 64 && [...owned.keys()].every((id) => ids.has(id)),
                    "page-scale-unexpected-page",
                );
            }
        },
        async close() {
            let failed = false;
            const deadline = Date.now() + 120_000;
            for (const [title, path] of pending) {
                if (Date.now() > deadline) {
                    failed = true;
                    break;
                }
                try {
                    const found = await fixturePage(client, "pages.list", { query: title, limit: 2 });
                    assertCondition(Array.isArray(found.items) && found.items.length <= 1);
                    for (const value of found.items) {
                        const page = requireRecord(value);
                        assertCondition(page.title === title && page.path === path && typeof page.id === "string");
                        owned.set(page.id, { title, path });
                    }
                    pending.delete(title);
                } catch {
                    failed = true;
                }
            }
            for (const id of [...owned.keys()]) {
                if (Date.now() > deadline) {
                    failed = true;
                    break;
                }
                try {
                    await remove(id);
                } catch {
                    failed = true;
                }
            }
            try {
                const final = await list();
                assertCondition(Array.isArray(final.items) && final.items.length === 0, "page-scale-live-pages-remain");
            } catch {
                failed = true;
            }
            assertCondition(!failed, "page-scale-cleanup-failed");
            // Owned gone routes are retained domain history until the isolated stack is removed.
        },
    };
}
