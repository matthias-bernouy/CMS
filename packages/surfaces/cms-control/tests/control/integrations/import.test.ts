import { describe, expect, test } from "bun:test";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import {
    makeCms,
    manualSourceDefinition,
    postImport,
    recordingPackageResolver,
    sourceWithFunctionDefinition,
} from "./support/helpers";

describe("POST /api/integrations/import", () => {
    for (const status of ["blocked", "inadmissible", "unverified"] as const) {
        test(`rejects a forged exact install for a ${status} repository version`, async () => {
            const { cms, integrationCatalog, integrationInstallations } = makeCms();
            integrationCatalog.getIndex = async () => ({
                kind: "test-secret-source",
                label: "Test secret source",
                stable: "1.0.0",
                latest: "1.0.0",
                versions: [
                    {
                        version: "1.0.0",
                        path: "versions/1.0.0",
                        definition: "integration.json",
                        status,
                    },
                ],
            });

            await expect(
                postIntegrationImport(
                    postImport({
                        kind: "test-secret-source",
                        version: "1.0.0",
                        answers: { id: "secret-source-main", apiKey: "sk_test" },
                    }),
                    cms,
                ),
            ).rejects.toThrow(`is ${status} and cannot be installed or upgraded`);

            expect(await integrationInstallations.get("test-secret-source")).toBeNull();
        });
    }

    test("creates a tracked Test secret source installation without exposing the secret value", async () => {
        const { cms, secrets, sources, integrationInstallations } = makeCms();

        const res = await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        const body = await res.json();
        const secretKey = body.installation.secretRefs.apiKey;

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "created" }]);
        expect(body.secrets).toEqual([{ input: "apiKey", key: secretKey, action: "created" }]);
        expect(secretKey).toMatch(/^TEST_SOURCE_SECRET_SOURCE_MAIN_[A-F0-9]{8}_API_KEY$/);
        expect(JSON.stringify(body)).not.toContain("sk_test");
        expect(await secrets.get(secretKey)).toBe("sk_test");
        expect(await integrationInstallations.get("test-secret-source")).not.toBeNull();

        const source = await sources.getSource("urn:secret-source-main");
        expect(source?.endpoints[0]?.headers).toEqual([
            { name: "authorization", source: { from: "secret", ref: `\${${secretKey}}`, prefix: "Bearer " } },
        ]);
    });

    test("imports a manual declarative definition as a tracked installation", async () => {
        const { cms, sources, integrationInstallations } = makeCms();

        const res = await postIntegrationImport(
            postImport({
                definition: manualSourceDefinition(),
                answers: { id: "manual", targetUrl: "https://api.example.com/items" },
            }),
            cms,
        );
        const body = await res.json();

        expect(body.installation.id).toBe("manual-source");
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:manual", action: "created" }]);
        expect((await sources.getSource("urn:manual"))?.endpoints[0]?.targetUrl).toBe("https://api.example.com/items");
        expect(await integrationInstallations.get("manual-source")).not.toBeNull();
    });

    test("imports function artifacts through the configured function repository", async () => {
        const { cms, functions } = makeCms();

        const res = await postIntegrationImport(
            postImport({
                definition: sourceWithFunctionDefinition(),
                answers: { id: "owned-items", targetUrl: "https://api.example.com/items" },
            }),
            cms,
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([
            { type: "source", id: "urn:owned-items", action: "created" },
            { type: "function", id: "readOwnedItem", action: "created" },
        ]);
        expect(await functions.getFunction("readOwnedItem")).toMatchObject({
            id: "readOwnedItem",
            steps: [
                {
                    id: "item",
                    call: {
                        source: "owned-items",
                        endpoint: "read",
                        params: { itemId: "$input.params.itemId" },
                    },
                },
            ],
        });
    });

    test("uses the integration kind as the installation id", async () => {
        const { cms, integrationInstallations } = makeCms([{ kind: "no-id", label: "No ID", inputs: [] }]);

        const res = await postIntegrationImport(
            postImport({
                kind: "no-id",
                answers: {},
            }),
            cms,
        );
        const body = await res.json();

        expect(body.installation.id).toBe("no-id");
        expect(await integrationInstallations.get("no-id")).not.toBeNull();
    });

    test("injects the package resolver and persists its digest on create", async () => {
        const { cms, integrationInstallations } = makeCms();
        const { resolver, requests } = recordingPackageResolver();
        cms.integrationPackageResolver = resolver;

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            kind: "test-secret-source",
            version: "1.0.0",
            reason: "create",
            allowEmbeddedFallback: false,
        });
        expect((await integrationInstallations.get("test-secret-source"))?.packageDigest).toBe("a".repeat(64));
    });

    test("fails before writing when no integration installation repository is configured", async () => {
        const { cms, sources, secrets } = makeCms();
        Object.defineProperty(cms, "integrationInstallations", {
            get() {
                throw new Error("integration installations repository not configured");
            },
        });

        await expect(
            postIntegrationImport(
                postImport({
                    kind: "test-secret-source",
                    answers: { id: "secret-source-main", apiKey: "sk_test" },
                }),
                cms,
            ),
        ).rejects.toThrow(/integration installations repository not configured/);

        expect(await sources.getSource("urn:secret-source-main")).toBeNull();
        expect(await secrets.listKeys()).toEqual([]);
    });
});
