import { describe, expect, test } from "bun:test";
import getIntegrationInstances from "cms-control/api/integrations/instances.get";
import postIntegrationImport from "cms-control/api/integrations/import.post";
import { getInstances, makeCms, manualSourceDefinition, postImport } from "./helpers";

describe("GET /api/integrations/instances", () => {
    test("lists tracked instances and reconciles missing source artifacts", async () => {
        const { cms, sources } = makeCms();

        await postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_test" },
        }), cms);

        let res = await getIntegrationInstances(getInstances(), cms);
        let body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("stripe:stripe-main");
        expect(body[0].missingArtifactCount).toBe(0);

        await sources.deleteSource("urn:stripe-main");
        res = await getIntegrationInstances(getInstances("stripe:stripe-main"), cms);
        body = await res.json();
        expect(body.missingArtifactCount).toBe(1);
        expect(body.artifacts[0].exists).toBe(false);
        expect(JSON.stringify(body)).not.toContain("sk_test");
    });

    test("marks artifact status as unknown when source reconciliation fails", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_test" },
        }), cms);
        cms.sources.getAllSources = async () => {
            throw new Error("source store unavailable");
        };

        const res = await getIntegrationInstances(getInstances(), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body[0].artifacts[0].exists).toBe("unknown");
        expect(body[0].missingArtifactCount).toBe(0);
    });

    test("includes the definition snapshot on instance details", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(postImport({
            kind: "manual-source",
            definition: manualSourceDefinition(),
            answers: { id: "manual", targetUrl: "https://api.example.com/items" },
        }), cms);

        const res = await getIntegrationInstances(getInstances("manual-source:manual"), cms);
        const body = await res.json();

        expect(body.definition.kind).toBe("manual-source");
        expect(body.definition.artifacts[0].source.id).toBe("{{answers.id}}");
    });

    test("returns 404 for missing instance details", async () => {
        const { cms } = makeCms();

        const res = await getIntegrationInstances(getInstances("stripe:missing"), cms);

        expect(res.status).toBe(404);
    });
});
