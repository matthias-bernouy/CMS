import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const versionRoot = resolve(import.meta.dir, "../../../integrations/domains/consent/versions/1.0.0");

describe("Consent integration contract", () => {
    test("keeps consent policy in integration artifacts, not an auth-specific bloc", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repository.get("consent");
        expect(definition).toMatchObject({ kind: "consent", version: "1.0.0" });
        expect(definition?.artifacts.map((artifact) => artifact.type).sort()).toEqual([
            "bloc",
            "dashboard",
            "function",
            "function",
            "source",
            "trigger",
            "trigger",
        ]);

        const source = definition?.artifacts.find((artifact) => artifact.type === "source");
        expect(source?.source.endpoints.map((endpoint) => [endpoint.endpointId, endpoint.access])).toEqual([
            ["getRequirements", { mode: "public" }],
            ["syncContext", { mode: "system" }],
            ["stageAcceptance", { mode: "system" }],
            ["commitAcceptance", { mode: "system" }],
            ["listAcceptances", { mode: "admin" }],
            ["health", { mode: "admin" }],
        ]);

        const httpContract = definition?.connectors?.[0]?.functions?.[0]?.compatibility?.http;
        expect(httpContract?.requiredSecrets).toEqual(["CMS_CONSENT_API_KEY"]);
        expect(
            httpContract?.endpoints.map(({ method, route, requiredInputs, requiredHeaders }) => ({
                method,
                route,
                requiredInputs,
                requiredHeaders,
            })),
        ).toEqual([
            { method: "GET", route: "/acceptances", requiredInputs: [], requiredHeaders: ["authorization"] },
            {
                method: "POST",
                route: "/acceptances/commit",
                requiredInputs: ["cmsUserId", "contextKey"],
                requiredHeaders: ["authorization"],
            },
            {
                method: "POST",
                route: "/acceptances/stage",
                requiredInputs: ["contextKey"],
                requiredHeaders: ["authorization"],
            },
            { method: "POST", route: "/context/sync", requiredInputs: [], requiredHeaders: ["authorization"] },
            { method: "GET", route: "/health", requiredInputs: [], requiredHeaders: ["authorization"] },
            {
                method: "GET",
                route: "/requirements",
                requiredInputs: ["context"],
                requiredHeaders: ["authorization"],
            },
        ]);
    });

    test("request and response gates forward only bounded consent fields", async () => {
        const stageTrigger = await json("definitions/artifacts/triggers/stage-target-consent.json");
        const commitTrigger = await json("definitions/artifacts/triggers/commit-target-consent.json");
        const stageFunction = await json("definitions/artifacts/functions/stage-consent-acceptance.json");
        const commitFunction = await json("definitions/artifacts/functions/commit-consent-acceptance.json");

        expect(stageTrigger.trigger).toMatchObject({
            critical: true,
            mode: "sync",
            failureMode: "block",
            event: { source: "system-auth", endpoint: "signup", phase: "request" },
            function: {
                body: {
                    contextKey: "{{answers.contextKey}}",
                    subjectClaim: "$request.body.email",
                    attemptId: "$request.body.consentAttemptId",
                    acceptedVersionIds: "$request.body.acceptedConsentVersionIds",
                },
            },
        });
        expect(commitTrigger.trigger).toMatchObject({
            critical: true,
            mode: "sync",
            failureMode: "block",
            event: { source: "system-auth", endpoint: "signup", phase: "response" },
            condition: {
                all: [{ equals: ["$response.status", 200] }, { exists: "$response.body.cmsUserId" }],
            },
            function: { body: { cmsUserId: "$response.body.cmsUserId" } },
        });
        for (const artifact of [stageTrigger, commitTrigger, stageFunction, commitFunction]) {
            const source = JSON.stringify(artifact);
            expect(source).not.toContain('"$request.body"');
            expect(source).not.toContain("password");
        }
        expect(stageFunction.function.input.body).toEqual({
            $include: "../sources/primary/shared/stage-acceptance-request.json",
        });
        expect(commitFunction.function.input.body).toEqual({
            $include: "../sources/primary/shared/commit-acceptance-request.json",
        });
        const stageRequest = await json("definitions/artifacts/sources/primary/shared/stage-acceptance-request.json");
        const commitRequest = await json("definitions/artifacts/sources/primary/shared/commit-acceptance-request.json");
        expect(stageRequest).toMatchObject({
            type: "object",
            required: ["contextKey"],
            properties: { acceptedVersionIds: { type: "array", items: { type: "string" } } },
        });
        expect(commitRequest).toMatchObject({
            type: "object",
            required: ["contextKey", "cmsUserId"],
            properties: { cmsUserId: { type: "string" } },
        });
        expect(JSON.stringify(stageTrigger)).not.toContain("targetSourceId");
        expect(JSON.stringify(stageTrigger)).not.toContain("targetEndpointId");
    });

    test("stores keyed subject claims and versioned evidence without raw credentials", async () => {
        const auth = await text("connectors/supabase/functions/cms-consent/core/auth.ts");
        const evidence = await text("connectors/supabase/sql/model/evidence.sql");
        const stage = await text("connectors/supabase/sql/commands/stage-acceptance.sql");
        const commit = await text("connectors/supabase/sql/commands/commit-acceptance.sql");
        const stageRoute = await text("connectors/supabase/functions/cms-consent/routes/acceptances.ts");
        const combined = `${evidence}\n${stage}\n${commit}`;

        expect(auth).toContain('{ name: "HMAC", hash: "SHA-256" }');
        expect(auth).toContain("cms-consent-subject-claim-v1\\0");
        expect(combined).toContain("subject_claim_hash");
        expect(combined).not.toMatch(/\bemail\b/i);
        expect(combined).not.toMatch(/\bpassword\b/i);
        expect(evidence).toContain("committed_at desc, id desc");
        expect(evidence).toContain("consent_intent_documents_version_idx");
        expect(evidence).toContain("consent_acceptance_documents_version_idx");
        expect(await text("connectors/supabase/sql/model/configuration.sql")).toContain("published_snapshot_url");
        expect(await text("connectors/supabase/sql/commands/hashing.sql")).toContain(
            "'publishedSnapshotUrl', p_published_snapshot_url",
        );
        expect(await text("connectors/supabase/sql/commands/context/projections.sql")).toContain("'consentPrefix'");
        expect(stage).toContain("consent.consent_requirements_projection(p_context_key)");
        expect(stage).not.toContain("p_verified_documents");
        expect(stageRoute).not.toContain("publishedPages");
        expect(stageRoute).not.toContain("currentDocuments");
    });
});

async function json(path: string): Promise<Record<string, any>> {
    return JSON.parse(await text(path));
}

function text(path: string): Promise<string> {
    return Bun.file(resolve(versionRoot, path)).text();
}
