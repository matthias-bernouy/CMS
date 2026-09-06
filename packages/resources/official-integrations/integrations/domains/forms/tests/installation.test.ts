import { expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";

const integrationsRoot = new URL("../../..", import.meta.url).pathname;
const formsRoot = new URL("../", import.meta.url).pathname;

test("Forms 1.0.0 imports its source backend, dashboard views, and connector", async () => {
    const definitions = new FsIntegrationDefinitionRepository(integrationsRoot);
    const definition = await definitions.get("forms");
    expect(definition).toBeTruthy();

    const sources = new InMemorySourceRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const result = await importIntegration(
        {
            sources,
            installations,
            dashboards,
            dashboardViews,
            secrets: new InMemorySecretStore(),
            roles: new InMemoryRolesRepository(),
            sourceOverlays: new InMemorySourceOverlayRepository(),
            functions: new InMemoryFunctionRepository(),
            triggers: new InMemoryTriggerRepository(),
            connectorDeployers: [
                {
                    provider: "supabase",
                    async previewOutputs() {
                        return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
                    },
                    async deploy(next) {
                        deployment = next;
                        return {
                            provider: "supabase",
                            outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                            resources: [{ type: "schema", id: "install/sql/schema.manifest.json", action: "applied" }],
                        };
                    },
                },
            ],
            provisioners: [],
        },
        { kind: "forms", answers: {}, options: {} },
        [definition as IntegrationDefinition],
    );

    const source = await sources.getSource("urn:forms");
    expect(source).toBeTruthy();
    expect(validateSource(source!)).toEqual([]);
    expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:forms:submitAuthenticated");

    expect(definition).toMatchObject({ version: "1.0.0", type: "source" });
    expect(definition?.artifacts?.map((artifact) => artifact.type)).toEqual([
        "source",
        "dashboard-view",
        "dashboard-view",
        "function",
    ]);
    expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
        "source",
        "function",
        "dashboard-view",
        "dashboard-view",
        "dashboard",
    ]);
    expect((await dashboards.getAllDashboards()).map((dashboard) => dashboard.id)).toEqual(["forms"]);
    expect(deployment?.dataApiSchemas).toEqual(["forms"]);
    expect(deployment?.functions.map((fn) => fn.name)).toEqual(["cms-forms"]);
});

test("retains the Forms 1.0.0 verification against its immutable package", async () => {
    const integrationPackage = await readIntegrationPackageDirectory({
        root: formsRoot,
        kind: "forms",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "release-notes.txt",
        excludeRootEntries: ["integration.json", "tests"],
    });
    const verification = await Bun.file(new URL("./verification/1.0.0.json", import.meta.url)).json();

    expect(verification.target).toEqual({
        kind: "forms",
        version: "1.0.0",
        packageDigest: integrationPackage.digest,
    });
});
