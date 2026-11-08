import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/profiles/execution/support";
import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { apiSignature } from "./apiSignature";
import previous from "./previous-apis.json";

test("historical v1 capability signatures remain compatible while unshipped exact pins refuse execution", async () => {
    const root = resolve(import.meta.dir, "../../../../../ulvia-cli/dist/bootstrap");
    const index = JSON.parse(await readFile(resolve(root, "index.json"), "utf8")) as { contracts: string[] };
    const releases = await Promise.all(
        index.contracts.map(async (path) => parseContractReleaseJson(await readFile(resolve(root, path)))),
    );
    const support = new ProviderExecutionSupport();
    for (const reference of previous.releases) {
        // API comparison remains historical evidence; this build cannot advertise an unshipped exact release.
        expect(() => support.assert(reference, previous.image)).toThrow("does not support");
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

test("the runtime support matrix contains exactly the SDK's shipped executable claims", async () => {
    const { loadOfficialFeatures } = await import("@bernouy/ulvia-provider/capabilities");
    const runtime = await loadOfficialFeatures();
    const pins = runtime.implementations
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }))
        .sort((a, b) => (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0));
    const support = new ProviderExecutionSupport();
    expect(support.releases).toEqual(pins);
    for (const pin of pins) {
        expect(() => support.assert(pin, "runtime artifact")).not.toThrow();
    }
    expect(support.releases.some((pin) => pin.contractId === "ulvia/provider.cms-instances")).toBe(false);
});
