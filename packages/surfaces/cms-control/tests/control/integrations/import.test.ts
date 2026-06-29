import { describe, expect, test } from "bun:test";
import postIntegrationImport from "cms-control/api/integrations/import.post";
import { makeCms, manualSourceDefinition, postImport } from "./helpers";

describe("POST /api/integrations/import", () => {
    test("creates a tracked Stripe instance without exposing the secret value", async () => {
        const { cms, secrets, sources, integrationInstances } = makeCms();

        const res = await postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_test" },
        }), cms);
        const body = await res.json();
        const secretKey = body.instance.secretRefs.apiKey;

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:stripe-main", action: "created" }]);
        expect(body.secrets).toEqual([{ input: "apiKey", key: secretKey, action: "created" }]);
        expect(secretKey).toMatch(/^STRIPE_STRIPE_MAIN_[A-F0-9]{8}_API_KEY$/);
        expect(JSON.stringify(body)).not.toContain("sk_test");
        expect(await secrets.get(secretKey)).toBe("sk_test");
        expect(await integrationInstances.get("stripe:stripe-main")).not.toBeNull();

        const source = await sources.getSource("urn:stripe-main");
        expect(source?.endpoints[0]?.headers).toEqual([
            { name: "authorization", source: { from: "secret", ref: `\${${secretKey}}`, prefix: "Bearer " } },
        ]);
    });

    test("imports a manual declarative definition as a tracked instance", async () => {
        const { cms, sources, integrationInstances } = makeCms();

        const res = await postIntegrationImport(postImport({
            definition: manualSourceDefinition(),
            answers: { id: "manual", targetUrl: "https://api.example.com/items" },
        }), cms);
        const body = await res.json();

        expect(body.instance.id).toBe("manual-source:manual");
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:manual", action: "created" }]);
        expect((await sources.getSource("urn:manual"))?.endpoints[0]?.targetUrl)
            .toBe("https://api.example.com/items");
        expect(await integrationInstances.get("manual-source:manual")).not.toBeNull();
    });

    test("requires a tracked identity for integrations without an id answer", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationImport(postImport({
            kind: "ban",
            answers: {},
        }), cms)).rejects.toThrow(/instance\.id/);
    });

    test("fails before writing when no integration instance repository is configured", async () => {
        const { cms, sources, secrets } = makeCms();
        Object.defineProperty(cms, "integrationInstances", {
            get() {
                throw new Error("integration instances repository not configured");
            },
        });

        await expect(postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_test" },
        }), cms)).rejects.toThrow(/integration instances repository not configured/);

        expect(await sources.getSource("urn:stripe-main")).toBeNull();
        expect(await secrets.listKeys()).toEqual([]);
    });
});
