import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import { HttpRepositoryCompatibilityReader } from "../../../src/repositoryCatalog/compatibility/reader";

describe("HTTP public compatibility reader", () => {
    test("projects one strict anonymous page for Delivery reuse", async () => {
        const requests: Array<Readonly<{ url: URL; init?: RequestInit }>> = [];
        const reader = new HttpRepositoryCompatibilityReader({
            baseUrl: "https://repository.example/.cms/repository",
            fetch: async (input, init) => {
                requests.push({ url: new URL(String(input)), init });
                return response(compatibilityDocument());
            },
        });

        const page = await reader.list("commerce", "1.0.0", { limit: 100 });

        expect(page).toMatchObject({
            admission: { id: "admission-1", packageDigest: "a".repeat(64) },
            current: { id: "revision-1" },
            totalRevisions: 1,
        });
        expect(page?.revisions[0]?.provenance).toEqual({ reason: "Comparator update", evidenceIds: ["ci-1"] });
        expect(page?.revisions[0]?.evidence[0]?.path).toBeUndefined();
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url.pathname).toBe("/.cms/repository/api/integrations/compatibility");
        expect(requests[0]?.init).toMatchObject({ credentials: "omit", redirect: "error", method: "GET" });
        expect([...new Headers(requests[0]?.init?.headers).keys()]).toEqual(["accept"]);
    });

    test("rejects extra upstream fields as a 502 contract error", async () => {
        const reader = new HttpRepositoryCompatibilityReader({
            baseUrl: "https://repository.example/.cms/repository",
            fetch: async () => response({ ...compatibilityDocument(), internalPath: "/private/registry" }),
        });

        await expect(reader.list("commerce", "1.0.0")).rejects.toBeInstanceOf(IntegrationRepositoryContractError);
    });
});

function compatibilityDocument() {
    const common = {
        kind: "commerce",
        version: "1.0.0",
        packageDigest: "a".repeat(64),
        evaluator: { name: "compatibility", version: "2.0.0" },
        createdAt: "2026-07-26T12:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        evidence: [
            { classification: "compatible", surface: "definition", code: "definition-stable", message: "Stable" },
        ],
        outcome: "compatible",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible: true,
        noBaselineReason: "new-kind",
    };
    const admission = { ...common, id: "admission-1", reportType: "admission" };
    const revision = {
        ...common,
        id: "revision-1",
        reportType: "revision",
        supersedes: "admission-1",
        provenance: { reason: "Comparator update", evidenceIds: ["ci-1"] },
    };
    return { admission, current: revision, revisions: [revision], totalRevisions: 1 };
}

function response(value: unknown): Response {
    const body = JSON.stringify(value);
    return new Response(body, {
        headers: {
            "content-length": String(new TextEncoder().encode(body).byteLength),
            "content-type": "application/json; charset=utf-8",
            etag: `"${"c".repeat(64)}"`,
        },
    });
}
