import { describe, expect, test } from "bun:test";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import postIntegrationInstallationRerun from "cms-control/api/_platform/integrations/installations/rerun.post";
import { makeCms, postImport, postRerun, TEST_SECRET_SOURCE_DEFINITION } from "./support/helpers";

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

        const res = await postIntegrationInstallationRerun(postRerun("test-secret-source"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "updated" }]);
        expect(body.installation.runCount).toBe(2);
        expect((await sources.getSource("urn:secret-source-main"))?.endpoints).toHaveLength(1);
        expect(JSON.stringify(body)).not.toContain("sk_test");
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

    test("rotates a secret and its matching public configuration atomically", async () => {
        const definition = {
            ...TEST_SECRET_SOURCE_DEFINITION,
            inputs: [
                ...TEST_SECRET_SOURCE_DEFINITION.inputs,
                { name: "publicKey", label: "Public key", type: "text" as const, required: true },
            ],
        };
        const { cms, integrationInstallations, secrets } = makeCms([definition]);
        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test_old", publicKey: "pk_test_old" },
            }),
            cms,
        );

        const res = await postIntegrationInstallationRerun(
            postRerun("test-secret-source", {
                answers: { apiKey: "sk_live_new", publicKey: "pk_live_new" },
            }),
            cms,
        );
        const installation = await integrationInstallations.get("test-secret-source");

        expect(res.status).toBe(200);
        expect(installation?.answersSnapshot).toEqual({ id: "secret-source-main", publicKey: "pk_live_new" });
        expect(await secrets.get(installation!.secretRefs.apiKey!)).toBe("sk_live_new");
        expect(JSON.stringify(await res.json())).not.toContain("sk_live_new");
    });

    test("requires an integration id", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationInstallationRerun(postRerun(), cms)).rejects.toThrow(/Missing param id/);
    });
});
