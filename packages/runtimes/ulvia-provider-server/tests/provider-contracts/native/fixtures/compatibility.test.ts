import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/profiles/execution/support";
import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { apiSignature } from "./apiSignature";
import previous from "./previous-apis.json";

test("every capability of the explicitly retained published v1 contracts keeps its executable API", async () => {
    const root = resolve(import.meta.dir, "../../../../../ulvia-cli/dist/bootstrap");
    const index = JSON.parse(await readFile(resolve(root, "index.json"), "utf8")) as { contracts: string[] };
    const releases = await Promise.all(
        index.contracts.map(async (path) => parseContractReleaseJson(await readFile(resolve(root, path)))),
    );
    const support = new ProviderExecutionSupport();
    for (const reference of previous.releases) {
        support.assert(reference, previous.image);
        const current = releases.find(({ contractId }) => contractId === reference.contractId)!;
        for (const [id, signature] of Object.entries(reference.capabilities)) {
            const capability = current.capabilities.find((capability) => capability.id === id);
            expect(capability, `${reference.contractId}/${id}`).toBeDefined();
            expect(apiSignature(capability!), `${reference.contractId}/${id}`).toBe(signature);
        }
    }
});

test("the API evidence preserves business properties called description and includes execution authority", () => {
    const base = {
        id: "get",
        access: "public",
        behavior: { effect: "query", sensitive: false, execution: "sync" },
        input: { type: "object", properties: { description: { type: "string", maxLength: 10 } }, required: [] },
        output: { type: "null" },
        errors: [],
        bindings: [],
    } as never;
    const edited = structuredClone(base) as unknown as {
        input: { properties: { description: { maxLength: number } } };
    };
    edited.input.properties.description.maxLength = 20;
    expect(apiSignature(edited as never)).not.toBe(apiSignature(base));
    expect(apiSignature({ ...(base as Record<string, unknown>), access: "admin" } as never)).not.toBe(
        apiSignature(base),
    );
});
