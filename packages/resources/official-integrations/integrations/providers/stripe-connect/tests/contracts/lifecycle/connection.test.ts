import { expect, test } from "bun:test";
import {
    executeIntegrationEndpoint,
    InMemoryIntegrationInstallationRepository,
    resolveTemplates,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { sourceDtoToSource } from "@bernouy/cms-sources";
import { handleMarketplaceTermsManagementRequest } from "../../../connectors/supabase/functions/cms-stripe-connect-management/handler";
import { harness } from "./harness";

test("ordinary Stripe connection save recovers failed runtime sync through its own retry endpoint", async () => {
    const provider = harness();
    try {
        const definition = (await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
            "stripe-connect",
        ))!;
        const source = definition.artifacts!.find((artifact) => artifact.type === "source")!;
        if (source.type !== "source") {
            throw new Error("Missing source");
        }
        const runtimeSource = sourceDtoToSource(
            resolveTemplates(source.source, {
                answers: {},
                secrets: { cmsApiKey: "${CMS_KEY}" },
                connectors: { supabase: { functionsBaseUrl: "https://edge.test" } },
            }),
        );
        const installations = new InMemoryIntegrationInstallationRepository();
        const secrets = new InMemorySecretStore();
        const secretRefs: Record<string, string> = {};
        for (const name of definition.management!.generatedSecrets!) {
            secretRefs[name] = `OWNED_${name.toUpperCase()}`;
            await secrets.set(secretRefs[name]!, "");
        }
        await secrets.set("STRIPE_KEY", provider.secrets.stripeSecretKey);
        await secrets.set("STRIPE_PUBLIC_KEY", provider.secrets.stripePublishableKey);
        await installations.create({
            id: definition.kind,
            label: definition.label,
            definitionVersion: "1.0.0",
            definitionSnapshot: definition,
            status: "success",
            secretRefs,
            secretInputs: [],
            answersSnapshot: {},
            artifacts: [{ type: "source", id: runtimeSource.urn, action: "created" }],
        });
        let failSync = true;
        let synchronized = 0;
        const deps = {
            installations,
            secrets,
            syncRuntimeSecrets: async (_installation: unknown, values: Record<string, string>) => {
                if (failSync) {
                    throw new Error("provider unavailable");
                }
                expect(Object.values(values)).toContain("sk_test_private");
                expect(Object.values(values).some((value) => value.startsWith("whsec_"))).toBe(true);
                synchronized++;
            },
        };
        const call = async (id: string, body: Record<string, unknown>) => {
            const endpoint = runtimeSource.endpoints.find((candidate) => candidate.urn.endsWith(`:${id}`))!;
            const request = new Request(endpoint.targetUrl, {
                method: "POST",
                headers: { authorization: "Bearer cms-test", "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            return executeIntegrationEndpoint(deps, endpoint, request, handleMarketplaceTermsManagementRequest, {
                id: "admin",
                role: "admin",
            });
        };
        const initial = await handleMarketplaceTermsManagementRequest(
            new Request("https://edge.test/cms-stripe-connect-management/connection", {
                headers: { authorization: "Bearer cms-test" },
            }),
        );
        expect(initial.status).toBe(200);
        expect(await initial.json()).toMatchObject({ savedRevision: null });
        await expect(
            call("saveConnection", {
                values: { stripeSecretKey: "${STRIPE_KEY}", stripePublishableKey: "${STRIPE_PUBLIC_KEY}" },
            }),
        ).rejects.toThrow("synchronization failed");
        expect(provider.row.operation).toBe("pending_sync");
        expect(provider.row.applied_revision).toBeNull();
        expect(provider.endpoints).toHaveLength(3);
        failSync = false;
        expect((await call("retryConnection", { expectedRevision: "stale" })).status).toBe(409);
        const response = await call("retryConnection", { expectedRevision: provider.row.saved_revision });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.appliedRevision).toBe(provider.row.saved_revision);
        expect(result._cms).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain("whsec_");
        expect(JSON.stringify(result)).not.toContain("sk_test_private");
        expect(synchronized).toBe(1);
        expect(provider.endpoints).toHaveLength(3);
        expect((await installations.get(definition.kind))?.managementLease).toBeUndefined();
    } finally {
        provider.restore();
    }
});
