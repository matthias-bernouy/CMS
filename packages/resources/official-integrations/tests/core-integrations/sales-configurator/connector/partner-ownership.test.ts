import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";

const versionRoot = resolve(import.meta.dir, "../../../../integrations/domains/sales-configurator/versions/1.0.0");
const sqlRoot = resolve(versionRoot, "connectors/supabase/sql");
const functionRoot = resolve(versionRoot, "connectors/supabase/functions/cms-sales-configurator");

describe("sales-configurator partner ownership contracts", () => {
    test("keeps the CMS subject only on the integration account mapping", async () => {
        const files = await matchingFiles(sqlRoot, "**/*.sql");
        const foreignKeys = (await Promise.all(files.map(async (file) => await Bun.file(file).text()))).filter(
            (source) => /references\s+sales_configurator\.partner_accounts\s*\(\s*cms_user_id\s*\)/i.test(source),
        );

        expect(foreignKeys).toEqual([]);
    });

    test("removes legacy ownership columns after a lossless idempotent backfill", async () => {
        const clientModel = await sql("partners/model.sql");
        const proposalModel = await sql("proposals/proposal-model.sql");
        const migration = await sql("proposals/ownership-migration.sql");
        const manifest = await Bun.file(resolve(sqlRoot, "proposals/manifest.json")).json();

        expect(clientModel).toContain("set partner_account_id = partner.id");
        expect(proposalModel).toContain("set partner_account_id = partner.id");
        expect(clientModel).toContain("alter column partner_account_id set not null");
        expect(proposalModel).toContain("alter column partner_account_id set not null");
        expect(migration).toContain("drop column if exists owner_cms_user_id");
        expect(migration.match(/drop column if exists owner_cms_user_id/g)).toHaveLength(2);
        expect(JSON.stringify(manifest)).toContain("ownership-migration.sql");
    });

    test("uses numeric partner ids in every partner business query and RPC", async () => {
        const partnerRoutes = await matchingFiles(functionRoot, "routes/partner/*.ts");
        const routeSource = (await Promise.all(partnerRoutes.map(async (file) => await Bun.file(file).text()))).join(
            "\n",
        );
        const businessSql = (
            await Promise.all(
                [
                    "partners/client-command.sql",
                    "proposals/projections/partner.sql",
                    "proposals/commands/draft/prepare.sql",
                    "proposals/commands/draft/save.sql",
                    "proposals/commands/publish.sql",
                    "proposals/commands/create-share.sql",
                    "proposals/commands/revoke-share.sql",
                ].map(sql),
            )
        ).join("\n");

        expect(routeSource).not.toContain("owner_cms_user_id");
        expect(routeSource).not.toContain("p_actor_cms_user_id");
        expect(routeSource).toContain("partner_account_id");
        expect(routeSource).toContain("p_partner_account_id");
        expect(businessSql).not.toContain("owner_cms_user_id");
        expect(businessSql).not.toContain("p_actor_cms_user_id");
        expect(businessSql).toContain("p_partner_account_id");
    });

    test("keeps the CMS subject admin-only in proposal projections", async () => {
        const partnerProjection = await sql("proposals/projections/partner.sql");
        const adminProjection = await sql("proposals/projections/admin.sql");
        const adminShape = await Bun.file(
            resolve(versionRoot, "definitions/artifacts/sources/primary/shapes/proposals/admin-detail.json"),
        ).json();

        expect(partnerProjection).not.toContain("cms_user_id");
        expect(adminProjection).toContain("'partnerAccountId', proposal.partner_account_id");
        expect(adminProjection).toContain("'cmsUserId', partner.cms_user_id");
        expect(adminShape.properties.partnerAccountId).toEqual({ type: "number" });
        expect(adminShape.properties.ownerCmsUserId).toBeUndefined();
    });

    test("declares a redacted getMyProposal event schema without weakening admin audit", async () => {
        const definition = (await resolveIntegrationDefinitionFile(
            resolve(versionRoot, "definition.json"),
            versionRoot,
        )) as IntegrationDefinition;
        const source = definition.artifacts.find((artifact) => artifact.type === "source")?.source;
        const getMyProposal = source?.endpoints.find((endpoint) => endpoint.endpointId === "getMyProposal");
        const manageProposal = source?.endpoints.find((endpoint) => endpoint.endpointId === "manageProposal");
        const partnerEvent = proposalEventProperties(getMyProposal);
        const adminEvent = proposalEventProperties(manageProposal);

        expect(partnerEvent).toMatchObject({
            id: { type: "number" },
            eventType: { type: "string" },
            actorType: { type: "string" },
            metadata: { type: "object" },
            occurredAt: { type: "string" },
        });
        expect(partnerEvent.actorId).toBeUndefined();
        expect(adminEvent.actorId).toEqual({ type: "string", nullable: true });
    });
});

type JsonObject = Record<string, unknown>;
type Endpoint = {
    endpointId: string;
    output: Array<{ status: string; body: JsonObject }>;
};
type IntegrationDefinition = {
    artifacts: Array<{
        type: string;
        source?: { endpoints: Endpoint[] };
    }>;
};

function proposalEventProperties(endpoint: Endpoint | undefined): JsonObject {
    const success = endpoint?.output.find((output) => output.status === "200");
    if (!success) {
        throw new Error(`missing successful proposal endpoint contract: ${endpoint?.endpointId ?? "unknown"}`);
    }
    const body = success.body;
    const proposal = isObject(body.properties) && isObject(body.properties.proposal) ? body.properties.proposal : body;
    const events = isObject(proposal.properties) ? proposal.properties.events : undefined;
    const items = isObject(events) ? events.items : undefined;
    if (!isObject(items) || !isObject(items.properties)) {
        throw new Error(`missing proposal event schema: ${endpoint?.endpointId ?? "unknown"}`);
    }
    return items.properties;
}

function isObject(value: unknown): value is JsonObject {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function sql(path: string): Promise<string> {
    return await Bun.file(resolve(sqlRoot, path)).text();
}

async function matchingFiles(root: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    for await (const file of new Bun.Glob(pattern).scan({ cwd: root, absolute: true })) {
        files.push(file);
    }
    return files.sort();
}
