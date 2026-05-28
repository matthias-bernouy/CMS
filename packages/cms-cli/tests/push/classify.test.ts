import { describe, test, expect } from "bun:test";
import { classifyPages } from "src/cli/push/pages/classify";
import type { LocalPage } from "src/cli/push/pages/scan";
import type { PushState } from "src/cli/push/shared/state";

function page(path: string, hash: string): LocalPage {
    return {
        path,
        file:        `pages${path === "/" ? "/index" : path}.html`,
        frontmatter: { title: "", description: "", visible: true, tags: [] },
        content:     "",
        hash,
    };
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

describe("classifyPages", () => {
    test("flags as `new` a local page that has no remote match", async () => {
        const out = await classifyPages([page("/about", "h1")], [], emptyState(), async () => "X", false);
        expect(out[0]?.status).toBe("new");
        expect(out[0]?.remoteId).toBeNull();
    });

    test("flags as `unchanged` when local hash equals remote hash", async () => {
        const out = await classifyPages(
            [page("/about", "same")],
            [{ id: "p1", path: "/about" }],
            emptyState(),
            async () => "same",
            false,
        );
        expect(out[0]?.status).toBe("unchanged");
    });

    test("flags as `update` when local diverges from remote, with no prior state", async () => {
        const out = await classifyPages(
            [page("/about", "local")],
            [{ id: "p1", path: "/about" }],
            emptyState(),
            async () => "remote",
            false,
        );
        expect(out[0]?.status).toBe("update");
    });

    test("flags as `conflict` when remote drifted from lastSeenRemote", async () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "page:/about": { hash: "old", lastSeenRemote: "old" } },
        };
        const out = await classifyPages(
            [page("/about", "local")],
            [{ id: "p1", path: "/about" }],
            state,
            async () => "drifted",
            false,
        );
        expect(out[0]?.status).toBe("conflict");
    });

    test("--force bypasses the conflict check", async () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "page:/about": { hash: "old", lastSeenRemote: "old" } },
        };
        const out = await classifyPages(
            [page("/about", "local")],
            [{ id: "p1", path: "/about" }],
            state,
            async () => "drifted",
            true,
        );
        expect(out[0]?.status).toBe("update");
    });
});
