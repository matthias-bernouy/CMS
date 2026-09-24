import { describe, expect, test } from "bun:test";
import { admitConformanceSuite, admitContractRelease, parseConformanceSuite } from "@bernouy/cms-contracts";
import { capability, contract } from "../dependencies/fixtures";

async function example() {
    const create = capability("item.create");
    const list = {
        ...capability("item.list"),
        behavior: { effect: "query" as const, execution: "sync" as const },
        input: {
            type: "object" as const,
            properties: { cursor: { type: "string" as const, nullable: true as const, maxLength: 64 } },
            required: [],
        },
        output: {
            type: "object" as const,
            properties: {
                items: { type: "array" as const, maxItems: 20, items: create.output },
                next: { type: "string" as const, nullable: true as const, maxLength: 64 },
            },
            required: ["items", "next"],
        },
    };
    const operation = {
        ...capability("item.export"),
        behavior: { effect: "command" as const, execution: "operation" as const, idempotency: "keyed" as const },
        output: { type: "binary" as const, maxBytes: 1000, mediaTypes: ["application/pdf"] },
        binding: {
            ...capability("item.export").binding,
            response: { contentTypes: ["application/json"], successStatuses: [202], errorStatuses: {} },
        },
    };
    const admission = await admitContractRelease(contract("example", "1.0.0", [create, list, operation]));
    const base = { actor: { kind: "admin" }, expect: { kind: "success" } };
    const calls = [
        { ...base, id: "create", capabilityId: "item.create", input: { id: "sample" }, invocationKey: "item-key" },
        {
            ...base,
            id: "repeat",
            capabilityId: "item.create",
            input: { id: "sample" },
            invocationKey: "item-key",
            replayOf: "create",
        },
        {
            ...base,
            id: "visible",
            capabilityId: "item.list",
            input: {},
            eventually: { maxAttempts: 3, intervalMs: 10 },
            expect: { kind: "success", checks: [{ path: "/items/0/id", equals: "sample" }] },
            captures: [{ name: "item-id", path: "/items/0/id" }],
        },
        {
            ...base,
            id: "pages",
            capabilityId: "item.list",
            input: {},
            pagination: {
                itemsPath: "/items",
                cursorPath: "/next",
                cursorInput: "cursor",
                maxPages: 5,
                uniqueBy: "/id",
            },
        },
        {
            ...base,
            id: "export",
            capabilityId: "item.export",
            input: { id: { $capture: "item-id" } },
            completion: { timeoutMs: 1000, pollIntervalMs: 100 },
        },
    ];
    const suite = {
        kind: "contract-conformance-suite",
        protocol: "ulvia-conformance/v1",
        version: "1.0.0",
        isolation: "disposable-tenant",
        contractId: admission.release.contractId,
        contractVersion: admission.release.version,
        contractDigest: admission.digest,
        publisherId: admission.release.publisherId,
        scenarios: [{ id: "lifecycle", calls }],
    };
    return { admission, suite };
}

describe("execution controls through suite admission", () => {
    test("admits replay, bounded visibility, pagination and binary operation completion together", async () => {
        const { admission, suite } = await example();
        const result = await admitConformanceSuite(suite, admission);
        expect(result.suite.scenarios[0]!.calls).toHaveLength(5);
        expect(result.suite.scenarios[0]!.calls[1]!.replayOf).toBe("create");
        expect(result.suite.scenarios[0]!.calls[4]!.completion?.timeoutMs).toBe(1000);
    });

    test("rejects a replay changed after authoring before the suite can be hashed", async () => {
        const { admission, suite } = await example();
        suite.scenarios[0]!.calls[1]!.input = { id: "different" };
        await expect(admitConformanceSuite(suite, admission)).rejects.toThrow("preserve the authored input");
    });

    test("requires explicit completion instead of confusing operation acceptance with success", async () => {
        const { admission, suite } = await example();
        delete suite.scenarios[0]!.calls[4]!.completion;
        expect(() => parseConformanceSuite(suite, admission)).toThrow("requires a bounded completion");
    });

    test("does not treat an unasserted optional list item as a guaranteed capture", async () => {
        const { admission, suite } = await example();
        Object.assign(suite.scenarios[0]!.calls[2]!, { expect: { kind: "success" } });
        expect(() => parseConformanceSuite(suite, admission)).toThrow("guaranteed output bounds");
    });
});
