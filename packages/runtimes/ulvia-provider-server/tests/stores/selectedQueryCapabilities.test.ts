import { describe, expect, test } from "bun:test";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { ContentValidationError } from "@bernouy/cms-content";
import {
    selectedCapabilityResolver,
    selectedPublicSvgCapabilityValidator,
    selectedQueryCapabilityResolver,
} from "../../src/runtime/stores/selectedQueryCapabilities";

const capability = {
    id: "list",
    behavior: { sensitive: false, effect: "query", execution: "sync" },
    output: { type: "object", properties: { id: { type: "string", maxLength: 32 } }, required: ["id"] },
    errors: [{ code: "UNAVAILABLE", retryable: true }],
};

describe("selected query capability resolution", () => {
    test("uses the exact pinned digest and keeps historical yanked selections readable", async () => {
        const resolve = selectedQueryCapabilityResolver(
            "default",
            selections("sha256:" + "a".repeat(64)),
            releases("sha256:" + "a".repeat(64), true),
        );

        expect(await resolve([{ contractId: "catalog", capabilityId: "list" }])).toEqual([
            {
                contractId: "catalog",
                capabilityId: "list",
                output: capability.output,
                errors: capability.errors,
            },
        ]);
    });

    test("rejects a catalogue artifact that disagrees with the selected digest", async () => {
        const resolve = selectedQueryCapabilityResolver(
            "default",
            selections("sha256:" + "a".repeat(64)),
            releases("sha256:" + "b".repeat(64), false),
        );

        await expect(resolve([{ contractId: "catalog", capabilityId: "list" }])).rejects.toThrow(
            "unavailable or invalid",
        );
    });

    test("reports an unselected authored binding as invalid content", async () => {
        const selectionStore: ContractSelectionStore = {
            get: async () =>
                ({
                    siteId: "default",
                    revision: 1,
                    dependencyRevision: "fixture",
                    plan: { siteId: "default", selections: [], dependencies: [] },
                }) as never,
            replace: async () => {
                throw new Error("not used");
            },
        };
        const resolve = selectedCapabilityResolver(
            "default",
            selectionStore,
            releases("sha256:" + "a".repeat(64), false),
        );

        await expect(
            resolve([{ contractId: "forms", capabilityId: "submission.create", effect: "command" }]),
        ).rejects.toBeInstanceOf(ContentValidationError);
    });

    test("accepts only a selected public GET binding with a non-null SVG binary response", async () => {
        const validate = selectedPublicSvgCapabilityValidator(
            "default",
            selections("sha256:" + "a".repeat(64)),
            svgReleases("sha256:" + "a".repeat(64), "public", ["image/svg+xml"]),
        );

        await expect(validate([{ contractId: "catalog", bindingPath: "/icons/check" }])).resolves.toBeUndefined();
    });

    test("rejects authenticated and non-SVG binary bindings before authored content is stored", async () => {
        const authenticated = selectedPublicSvgCapabilityValidator(
            "default",
            selections("sha256:" + "a".repeat(64)),
            svgReleases("sha256:" + "a".repeat(64), "authenticated", ["image/svg+xml"]),
        );
        const wrongMedia = selectedPublicSvgCapabilityValidator(
            "default",
            selections("sha256:" + "a".repeat(64)),
            svgReleases("sha256:" + "a".repeat(64), "public", ["image/png"]),
        );

        await expect(authenticated([{ contractId: "catalog", bindingPath: "/icons/check" }])).rejects.toThrow(
            "not an available public",
        );
        await expect(wrongMedia([{ contractId: "catalog", bindingPath: "/icons/check" }])).rejects.toThrow(
            "not an available public",
        );
    });
});

function svgReleases(
    digest: string,
    access: "admin" | "authenticated" | "public",
    contentTypes: string[],
): ReleaseCatalogue {
    return {
        get: async () =>
            ({
                admission: {
                    digest,
                    release: {
                        contractId: "catalog",
                        version: "1.0.0",
                        capabilities: [
                            {
                                id: "icon",
                                access,
                                behavior: { sensitive: false, effect: "query", execution: "sync" },
                                input: {
                                    type: "object",
                                    properties: { name: { type: "string", maxLength: 64 } },
                                    required: ["name"],
                                },
                                output: { type: "binary", maxBytes: 65_536 },
                                errors: [],
                                bindings: [
                                    {
                                        id: "http",
                                        transport: "http",
                                        method: "GET",
                                        path: "/icons/{name}",
                                        input: { path: { name: "name" } },
                                        response: { successStatuses: [200], errorStatuses: {}, contentTypes },
                                    },
                                ],
                            },
                        ],
                    },
                },
                publishedAt: "2026-01-01T00:00:00.000Z",
            }) as never,
    } as ReleaseCatalogue;
}

function selections(digest: string): ContractSelectionStore {
    return {
        get: async () =>
            ({
                siteId: "default",
                revision: 1,
                dependencyRevision: "fixture",
                plan: {
                    siteId: "default",
                    selections: [
                        { siteId: "default", contractId: "catalog", version: "1.0.0", digest, installationId: "p1" },
                    ],
                    dependencies: [],
                    structurallyValid: true,
                    runtimeReadiness: "not-evaluated",
                },
            }) as never,
        replace: async () => {
            throw new Error("not used");
        },
    };
}

function releases(digest: string, yanked: boolean): ReleaseCatalogue {
    return {
        get: async () =>
            ({
                admission: { digest, release: { contractId: "catalog", version: "1.0.0", capabilities: [capability] } },
                publishedAt: "2026-01-01T00:00:00.000Z",
                ...(yanked ? { yank: { reason: "superseded" } } : {}),
            }) as never,
    } as ReleaseCatalogue;
}
