import { describe, expect, test } from "bun:test";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import { makeCms, manualSourceDefinition, postImport, sourceWithFunctionDefinition } from "./support/helpers";

describe("POST /api/integrations/import", () => {
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

    test("resolves nested page links through the published content repository", async () => {
        const definition: IntegrationDefinition = {
            kind: "page-config",
            label: "Page config",
            inputs: [
                {
                    name: "documents",
                    label: "Documents",
                    type: "object-list",
                    fields: [{ name: "page", label: "Page", type: "page-link", required: true }],
                },
            ],
        };
        const { cms, repository } = makeCms([definition]);
        const paths: string[] = [];
        Object.assign(repository, {
            getPublishedPage: async (path: string) => {
                paths.push(path);
                return {
                    id: "terms",
                    path,
                    title: "Terms",
                    description: "Current terms",
                    content: "<p>Terms</p>",
                    visible: true,
                    tags: [],
                };
            },
        });

        const response = await postIntegrationImport(
            postImport({
                kind: "page-config",
                answers: { documents: [{ page: "/terms" }] },
            }),
            cms,
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(paths).toEqual(["/terms"]);
        expect(body.installation.answersSnapshot).toEqual({ documents: [{ page: "/terms" }] });
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
