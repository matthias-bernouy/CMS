import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { officialContract } from "../../../execution/messages/fixtures";
import { authoringTransport } from "../transport";
import { fillPreparations, sourceJson } from "./fixture";

test("an administrator recovers a saturated preparation quota using only MCP capabilities", async () => {
    const root = await mkdtemp("/tmp/authoring-mcp-quota-");
    try {
        const authoring = await fillPreparations(root);
        const { call } = await authoringTransport(authoring);
        const binding = new CapabilityMcpBinding({
            contracts: async () => [await officialContract("ulvia/cms.authoring")],
            invoker: {
                invoke: async ({ capabilityId, input }) => {
                    if (!input || typeof input !== "object" || Array.isArray(input)) {
                        throw new Error("Expected an object input");
                    }
                    const response = await call(capabilityId, input as Record<string, unknown>);
                    expect(response.status).toBe(200);
                    return { kind: "success", requestId: crypto.randomUUID(), output: await response.json() };
                },
            },
        });
        const context = { siteId: "default", actor: { kind: "administrator" as const, subjectId: "admin" } };
        const tools = (await binding.list(context)).tools;
        const invoke = async (id: string, input: Record<string, unknown>) => {
            const name = capabilityToolName("ulvia/cms.authoring", id, "mcp", `authoring_${id.replaceAll("-", "_")}`);
            expect(tools.find((tool) => tool.name === name)?._meta["io.ulvia/access"]).toBe("admin");
            const result = await binding.call(name, { input }, context);
            return result.structuredContent!.output as Record<string, any>;
        };
        const before = await readdir(root);
        const rejected = await invoke("prepare-collection", { sourceJson });
        expect(rejected.valid).toBe(false);
        expect(rejected.diagnostics[0].code).toBe("preparation.quota_exceeded");
        expect(rejected.quota).toEqual({
            limit: 64,
            count: 64,
            listCapability: "list-preparations",
            discardCapability: "discard-preparation",
        });
        expect(await readdir(root)).toEqual(before);
        const page = await invoke("list-preparations", { limit: 1 });
        expect(page.items[0]).toMatchObject({
            kind: "collection",
            resourceId: "publisher/kit",
            version: "1.0.0",
            publicationState: "published",
        });
        expect(page.quota.count).toBe(64);
        expect(await invoke("discard-preparation", { preparationId: page.items[0].preparationId })).toEqual({
            discarded: true,
        });
        expect((await invoke("list-preparations", { limit: 1 })).quota.count).toBe(63);
        const prepared = await invoke("prepare-collection", { sourceJson });
        expect(prepared.valid).toBe(true);
        expect(prepared.collectionId).toBe("publisher/kit");
        expect(prepared.preparationId).toBeString();
        expect((await invoke("list-preparations", { limit: 1 })).quota.count).toBe(64);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("listing and discard refuse missing authority, foreign instances and invalid queries before accessing storage", async () => {
    const accessed: string[] = [];
    const { call } = await authoringTransport({
        listPreparations: async () => {
            accessed.push("list");
            return { items: [], nextCursor: null, quota: { limit: 64, count: 0, inProgress: 0 } };
        },
        discard: async () => {
            accessed.push("discard");
            return { discarded: true };
        },
    });
    const input = { preparationId: "00000000-0000-4000-8000-000000000001" };
    for (const [id, value] of [
        ["list-preparations", {}],
        ["discard-preparation", input],
    ] as const) {
        expect((await call(id, value, { authenticated: false })).status).toBe(401);
        expect((await call(id, value, { claims: { actorKind: "user" } })).status).toBe(403);
        expect((await call(id, value, { claims: { instanceId: "foreign" } })).status).toBe(401);
    }
    for (const input of [{ limit: 0 }, { limit: 9 }, { cursor: "../other" }, { siteId: "foreign" }]) {
        expect((await call("list-preparations", input)).status).toBe(400);
    }
    expect(accessed).toEqual([]);
});

test.each(["contract", "provider-manifest", "workflow"] as const)(
    "%s preparation reports the shared quota without changing retained work",
    async (kind) => {
        const root = await mkdtemp("/tmp/authoring-artifact-quota-");
        try {
            const authoring = await fillPreparations(root);
            const { call } = await authoringTransport(authoring);
            const before = await readdir(root);
            const sourceJson = JSON.stringify({
                files: [
                    {
                        path: "definition.json",
                        content: JSON.stringify({
                            kind,
                            [kind === "contract" ? "contractId" : kind === "workflow" ? "workflowId" : "providerId"]:
                                "publisher/kit",
                        }),
                    },
                ],
            });
            const response = await call(`prepare-${kind}`, { sourceJson });
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                valid: false,
                quota: { limit: 64, count: 64 },
                diagnostics: [expect.objectContaining({ code: "preparation.quota_exceeded" })],
            });
            expect(await readdir(root)).toEqual(before);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    },
);
