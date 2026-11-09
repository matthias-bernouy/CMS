import { compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/system/execution/support";
import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { apiSignature } from "./apiSignature";
import previous from "./previous-apis.json";

test("retained deployed v1 contracts keep their executable APIs and exact runtime support", async () => {
    const root = resolve(import.meta.dir, "../../../../../ulvia-cli/dist/bootstrap");
    const index = JSON.parse(await readFile(resolve(root, "index.json"), "utf8")) as { contracts: string[] };
    const releases = await Promise.all(
        index.contracts.map(async (path) => parseContractReleaseJson(await readFile(resolve(root, path)))),
    );
    const retained = (await compileRetainedFeatures()).flatMap((build) => build.contracts);
    const support = new ProviderExecutionSupport();
    for (const reference of previous.releases) {
        expect(() => support.assert(reference, previous.image)).not.toThrow();
        const current =
            retained.find(({ digest }) => digest === reference.digest)?.release ??
            releases.find(
                ({ contractId, version }) => contractId === reference.contractId && version === reference.version,
            )!;
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

test("the runtime support matrix includes exactly the current and explicitly retained executable claims", async () => {
    const { loadOfficialFeatures } = await import("@bernouy/ulvia-provider/capabilities");
    const runtime = await loadOfficialFeatures();
    const pins = runtime.implementations
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }))
        .sort((a, b) => (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0));
    const support = new ProviderExecutionSupport();
    const retained = (await import("@bernouy/ulvia-provider/build")).compileRetainedFeatures;
    const all = [
        ...pins,
        ...(await retained())
            .flatMap((build) => build.implementations)
            .map(({ contractId, version, digest }) => ({ contractId, version, digest })),
    ];
    expect(new Set(support.releases.map((pin) => pin.digest))).toEqual(new Set(all.map((pin) => pin.digest)));
    for (const pin of pins) {
        expect(() => support.assert(pin, "runtime artifact")).not.toThrow();
    }
    expect(support.releases.some((pin) => pin.contractId === "ulvia/provider.cms-instances")).toBe(false);
});

test("durable publication retains the preceding Authoring and Registry 1.1 execution pins", () => {
    const support = new ProviderExecutionSupport();
    for (const [contractId, digest] of [
        ["ulvia/cms.authoring", "sha256:454926be86079d930dc811bb60d5abde818fa8e03dd9d92374f6b33fc94df891"],
        ["ulvia/repository", "sha256:6c459684fb72e50e8e8093e74563c3f111d3f007639df12d5ad09379c2f834ef"],
    ]) {
        expect(() =>
            support.assert({ contractId: contractId!, version: "1.1.0", digest: digest! }, "previous release"),
        ).not.toThrow();
    }
});
