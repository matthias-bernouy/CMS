import { describe, expect, test } from "bun:test";
import getIntegrationInstallations from "cms-control/api/_platform/integrations/installations.get";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import {
    createInstallation,
    getInstallations,
    makeCms,
    manualSourceDefinition,
    postImport,
    sourceWithFunctionDefinition,
} from "./support/helpers";

describe("GET /api/integrations/installations", () => {
    test("lists persisted package provenance without fabricating it for legacy installations", async () => {
        const { cms, integrationInstallations } = makeCms();
        const digest = "a".repeat(64);
        await createInstallation(integrationInstallations, "pinned", digest);
        await createInstallation(integrationInstallations, "legacy");

        const response = await getIntegrationInstallations(getInstallations(), cms);
        const installations = (await response.json()) as Array<Record<string, unknown>>;
        const pinned = installations.find((installation) => installation.id === "pinned");
        const legacy = installations.find((installation) => installation.id === "legacy");

        expect(response.status).toBe(200);
        expect(pinned?.packageDigest).toBe(digest);
        expect(Object.hasOwn(legacy ?? {}, "packageDigest")).toBeFalse();
    });

    test("returns package provenance on details and omits it from legacy details", async () => {
        const { cms, integrationInstallations } = makeCms();
        const digest = "b".repeat(64);
        await createInstallation(integrationInstallations, "pinned", digest);
        await createInstallation(integrationInstallations, "legacy");

        const pinnedResponse = await getIntegrationInstallations(getInstallations("pinned"), cms);
        const pinned = (await pinnedResponse.json()) as Record<string, unknown>;
        const legacyResponse = await getIntegrationInstallations(getInstallations("legacy"), cms);
        const legacy = (await legacyResponse.json()) as Record<string, unknown>;

        expect(pinnedResponse.status).toBe(200);
        expect(pinned.packageDigest).toBe(digest);
        expect(legacyResponse.status).toBe(200);
        expect(Object.hasOwn(legacy, "packageDigest")).toBeFalse();
    });

    test("lists tracked installations and reconciles missing source artifacts", async () => {
        const { cms, sources } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );

        let res = await getIntegrationInstallations(getInstallations(), cms);
        let body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("test-secret-source");
        expect(body[0].missingArtifactCount).toBe(0);

        await sources.deleteSource("urn:secret-source-main");
        res = await getIntegrationInstallations(getInstallations("test-secret-source"), cms);
        body = await res.json();
        expect(body.missingArtifactCount).toBe(1);
        expect(body.artifacts[0].exists).toBe(false);
        expect(JSON.stringify(body)).not.toContain("sk_test");
    });

    test("marks artifact status as unknown when source reconciliation fails", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        cms.sources.getAllSources = async () => {
            throw new Error("source store unavailable");
        };

        const res = await getIntegrationInstallations(getInstallations(), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body[0].artifacts[0].exists).toBe("unknown");
        expect(body[0].missingArtifactCount).toBe(0);
    });

    test("includes the definition snapshot on installation details", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "manual-source",
                definition: manualSourceDefinition(),
                answers: { id: "manual", targetUrl: "https://api.example.com/items" },
            }),
            cms,
        );

        const res = await getIntegrationInstallations(getInstallations("manual-source"), cms);
        const body = await res.json();

        expect(body.definition.kind).toBe("manual-source");
        expect(body.definition.artifacts[0].source.id).toBe("{{answers.id}}");
    });

    test("reconciles function artifacts against the function repository", async () => {
        const { cms, functions } = makeCms();

        await postIntegrationImport(
            postImport({
                definition: sourceWithFunctionDefinition(),
                answers: { id: "owned-items", targetUrl: "https://api.example.com/items" },
            }),
            cms,
        );

        let res = await getIntegrationInstallations(getInstallations("function-source"), cms);
        let body = await res.json();
        expect(body.artifacts.find((artifact: { type: string }) => artifact.type === "function").exists).toBe(true);

        await functions.deleteFunction("readOwnedItem");
        res = await getIntegrationInstallations(getInstallations("function-source"), cms);
        body = await res.json();
        expect(body.artifacts.find((artifact: { type: string }) => artifact.type === "function").exists).toBe(false);
        expect(body.missingArtifactCount).toBe(1);
    });

    test("returns 404 for missing installation details", async () => {
        const { cms } = makeCms();

        const res = await getIntegrationInstallations(getInstallations("test-secret-source:missing"), cms);

        expect(res.status).toBe(404);
    });
});
