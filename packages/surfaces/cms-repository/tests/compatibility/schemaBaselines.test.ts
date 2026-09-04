import { describe, expect, test } from "bun:test";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "@bernouy/cms-repository";
import { TestRunner } from "../testRunner";

const PACKAGE_DIGEST = "a".repeat(64);

describe("@bernouy/cms-repository reviewed schema baselines", () => {
    test("serves exact safe projections for an immutable package", async () => {
        const requests: unknown[] = [];
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: emptyCatalog(),
            integrationSchemaBaselines: {
                listForPackage: async (kind, version, packageDigest) => {
                    requests.push({ kind, version, packageDigest });
                    return [
                        {
                            connector: { provider: "supabase", root: "connectors/supabase" },
                            packageDigest,
                            dependencies: [],
                            schema: { namespaces: [] },
                            provenance: {
                                evidenceId: `reviewed-schema-baseline-${"b".repeat(64)}`,
                                source: "legacy-backfill:reviewed@1.0.0",
                                reviewedAt: "2026-09-04T10:00:00.000Z",
                            },
                        },
                    ];
                },
            },
        });
        const path = `/api/integrations/schema-baselines?kind=demo&version=1.0.0&packageDigest=${PACKAGE_DIGEST}`;

        const response = await runner.handle(path);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("public, max-age=60");
        expect(body[0]).toMatchObject({
            connector: { provider: "supabase" },
            packageDigest: PACKAGE_DIGEST,
            schema: { namespaces: [] },
        });
        expect(requests).toEqual([{ kind: "demo", version: "1.0.0", packageDigest: PACKAGE_DIGEST }]);
        expect((await runner.handle("/api/integrations/schema-baselines?kind=demo&version=1.0.0")).status).toBe(400);
    });
});

function emptyCatalog(): IntegrationDefinitionRepository {
    return { list: async () => [], getIndex: async () => null, listVersions: async () => [], get: async () => null };
}
