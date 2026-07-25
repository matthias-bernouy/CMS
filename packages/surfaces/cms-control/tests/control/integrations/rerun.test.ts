import { describe, expect, test } from "bun:test";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import postIntegrationInstallationRerun from "cms-control/api/_platform/integrations/installations/rerun.post";
import postIntegrationInstallationUpgrade from "cms-control/api/_platform/integrations/installations/upgrade.post";
import { makeCms, postImport, postRerun, postUpgrade, TEST_SECRET_SOURCE_DEFINITION } from "./support/helpers";

describe("POST /api/integrations/installations/rerun", () => {
    test("reruns a tracked integration installation with stored secrets", async () => {
        const { cms, sources } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        let repositoryReads = 0;
        cms.integrationCatalog = {
            ...cms.integrationCatalog,
            get: async () => {
                repositoryReads += 1;
                throw new Error("the stored snapshot should avoid repository access");
            },
        };

        const res = await postIntegrationInstallationRerun(postRerun("test-secret-source"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "updated" }]);
        expect(body.installation.runCount).toBe(2);
        expect((await sources.getSource("urn:secret-source-main"))?.endpoints).toHaveLength(1);
        expect(JSON.stringify(body)).not.toContain("sk_test");
        expect(repositoryReads).toBe(0);
    });

    test("accepts rerun answer overrides", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_old" },
            }),
            cms,
        );

        const res = await postIntegrationInstallationRerun(
            postRerun("test-secret-source", {
                answers: { apiKey: "sk_new" },
            }),
            cms,
        );
        const body = await res.json();

        expect(body.installation.runCount).toBe(2);
        expect(JSON.stringify(body)).not.toContain("sk_new");
    });

    test("rejects an implicit version change before starting a rerun", async () => {
        const { cms, integrationInstallations } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );

        await expect(
            postIntegrationInstallationRerun(postRerun("test-secret-source", { version: "2.0.0" }), cms),
        ).rejects.toThrow(/explicit upgrade action/);

        const installation = await integrationInstallations.get("test-secret-source");
        expect(installation?.status).toBe("success");
        expect(installation?.runCount).toBe(1);
        expect(installation?.definitionVersion).toBe("1.0.0");
    });

    test("requests the installed exact version when a legacy snapshot is absent", async () => {
        const { cms, integrationInstallations } = makeCms();
        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        const installed = await integrationInstallations.get("test-secret-source");
        if (!installed) {
            throw new Error("expected the test installation");
        }
        await integrationInstallations.replace({ ...installed, definitionSnapshot: undefined });
        const requests: Array<[string, string | undefined]> = [];
        cms.integrationCatalog = {
            ...cms.integrationCatalog,
            get: async (kind: string, version?: string) => {
                requests.push([kind, version]);
                return kind === TEST_SECRET_SOURCE_DEFINITION.kind && version === "1.0.0"
                    ? TEST_SECRET_SOURCE_DEFINITION
                    : null;
            },
        };

        await postIntegrationInstallationRerun(postRerun("test-secret-source"), cms);

        expect(requests).toEqual([["test-secret-source", "1.0.0"]]);
    });

    test("requires an integration id", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationInstallationRerun(postRerun(), cms)).rejects.toThrow(/Missing param id/);
    });
});

describe("POST /api/integrations/installations/upgrade", () => {
    test("resolves an explicit target and updates the pin after success", async () => {
        const target = {
            ...TEST_SECRET_SOURCE_DEFINITION,
            version: "1.1.0",
            label: "Test secret source upgraded",
        };
        const { cms, integrationInstallations } = makeCms([TEST_SECRET_SOURCE_DEFINITION, target]);

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                version: "1.0.0",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );

        const response = await postIntegrationInstallationUpgrade(
            postUpgrade("test-secret-source", { version: "1.1.0" }),
            cms,
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.installation.definitionVersion).toBe("1.1.0");
        expect(body.installation.definitionSnapshot.version).toBe("1.1.0");
        expect((await integrationInstallations.get("test-secret-source"))?.definitionVersion).toBe("1.1.0");
    });

    test("requires an explicit target version", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationInstallationUpgrade(postUpgrade("test-secret-source", {}), cms)).rejects.toThrow(
            /Missing param version/,
        );
    });
});
