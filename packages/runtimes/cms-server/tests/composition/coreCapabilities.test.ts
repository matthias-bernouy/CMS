import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { LOCAL_CORE_CAPABILITY_ROUTE, mountLocalCoreCapabilities } from "../../src/runtime/coreCapabilities";

const token = "local-provider-to-core-token";

describe("local provider Core capability bridge", () => {
    test("authenticates and dispatches the bounded Pages contract", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/", "Home");
        const { runner, request } = capturePostRoute();
        mountLocalCoreCapabilities(runner, repository, token);
        const invoke = async (capabilityId: string, input: Readonly<Record<string, unknown>>) =>
            request({
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify({ contractId: "ulvia.cms.pages", capabilityId, input }),
            });
        const unauthorized = await request({ headers: { "content-type": "application/json" }, body: "{}" });
        expect(unauthorized.status).toBe(401);

        const response = await invoke("list", { limit: 10 });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ items: [{ title: "Home", surface: "delivery" }] });

        const [page] = await repository.getAllPages();
        const renamed = await invoke("rename", {
            id: page!.id,
            title: "Renamed",
            expectedRevision: page!.revision,
        });
        expect(renamed.status).toBe(200);
        expect(await renamed.json()).toMatchObject({ id: page!.id, title: "Renamed", revision: page!.revision + 1 });

        const created = await invoke("create", {
            path: "/admin/draft",
            title: "Draft",
            content: "<p>Draft</p>",
            surface: "control",
        });
        expect(created.status).toBe(200);
        const draft = (await created.json()) as { id: string; revision: number };
        expect(draft).toMatchObject({ revision: 1, surface: "control", visible: false });

        const fetched = await invoke("get", { id: draft.id });
        expect(await fetched.json()).toMatchObject({ id: draft.id, content: "<p>Draft</p>" });
        const updated = await invoke("update", {
            id: draft.id,
            expectedRevision: draft.revision,
            description: "Control-only draft",
            tags: ["admin"],
        });
        expect(await updated.json()).toMatchObject({ revision: 2, description: "Control-only draft", tags: ["admin"] });
        const published = await invoke("publish", { id: draft.id, expectedRevision: 2, visible: true });
        expect(await published.json()).toMatchObject({ revision: 3, visible: true });
        const deleted = await invoke("delete", { id: draft.id, expectedRevision: 3 });
        expect(await deleted.json()).toEqual({ id: draft.id, deleted: true });
        expect((await invoke("get", { id: draft.id })).status).toBe(404);
    });

    test("rejects unknown capabilities and oversized inputs", async () => {
        const { runner, request } = capturePostRoute();
        mountLocalCoreCapabilities(runner, new InMemoryCmsRepository(), token);
        const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
        expect(
            (
                await request({
                    headers,
                    body: JSON.stringify({ contractId: "unknown", capabilityId: "list", input: {} }),
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await request({
                    headers,
                    body: JSON.stringify({
                        contractId: "ulvia.cms.pages",
                        capabilityId: "list",
                        input: { x: "a".repeat(1024 * 1024 + 20_000) },
                    }),
                })
            ).status,
        ).toBe(413);
    });
});

function capturePostRoute(): { runner: Runner; request: (init: RequestInit) => Promise<Response> } {
    let handler: RouteHandler | undefined;
    const runner = {
        post(path: string, next: RouteHandler) {
            expect(path).toBe(LOCAL_CORE_CAPABILITY_ROUTE);
            handler = next;
        },
    } as unknown as Runner;
    return {
        runner,
        request: async (init) => {
            if (!handler) {
                throw new Error("Core capability route was not mounted.");
            }
            return handler(new Request(`http://localhost${LOCAL_CORE_CAPABILITY_ROUTE}`, { method: "POST", ...init }));
        },
    };
}
