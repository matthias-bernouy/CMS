import { expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
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

const integrationsRoot = new URL("../../../../", import.meta.url).pathname;

test("Forms 1.0.0 imports its source, dashboards, Bloc, and connector", async () => {
    const definitions = new FsIntegrationDefinitionRepository(integrationsRoot);
    const definition = await definitions.get("forms");
    expect(definition).toBeTruthy();

    const sources = new InMemorySourceRepository();
    const dashboards = new InMemoryDashboardRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create({
        id: "basic-blocs",
        label: "Basic Blocs",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "bloc", id: "basic-input", action: "created" }],
        runs: [],
    });

    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    await importIntegration(
        {
            sources,
            dashboards,
            installations,
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
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "forms", answers: { id: "forms" }, options: {} },
        [definition as IntegrationDefinition],
    );

    const source = await sources.getSource("urn:forms");
    expect(source).toBeTruthy();
    expect(validateSource(source!)).toEqual([]);
    expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:forms:submitAuthenticated");

    for (const dashboardId of ["forms-forms", "forms-submissions"]) {
        const dashboard = await dashboards.getDashboard(dashboardId);
        expect(dashboard).toBeTruthy();
        expect(validateDashboard(dashboard!, { source })).toEqual([]);
    }
    const formsDashboard = await dashboards.getDashboard("forms-forms");
    const table = formsDashboard?.views.find((widget) => widget.id === "formsTable");
    const detail = formsDashboard?.views.find((widget) => widget.id === "formDetail");
    const sectionDetail = formsDashboard?.views.find((widget) => widget.id === "sectionDetail");
    expect(table?.widget).toBe("w-table");
    expect(detail?.widget).toBe("w-detail");
    if (table?.widget !== "w-table" || detail?.widget !== "w-detail" || sectionDetail?.widget !== "w-detail") {
        throw new Error("Forms dashboard widgets are missing");
    }
    expect(table.rowKey).toBe("key");
    expect(detail.source.params).toEqual({ key: "$selection.id" });
    expect(formsDashboard?.views.map((widget) => widget.id)).toEqual([
        "formsTable",
        "newFormDetail",
        "formDetail",
        "sectionDetail",
        "questionDetail",
    ]);
    expect(detail.main.filter((item) => "widget" in item).map((widget) => widget.id)).toEqual(["sectionNavigation"]);
    expect(sectionDetail.main.filter((item) => "widget" in item).map((widget) => widget.id)).toEqual([
        "questionNavigation",
    ]);
    expect(JSON.stringify(formsDashboard)).not.toContain("definitionJson");
    expect(detail.actions.find((action) => action.id === "saveDraft")?.after).toEqual({
        opens: "formDetail",
        row: "$result.key",
        resource: "$result",
    });
    const submissionsDashboard = await dashboards.getDashboard("forms-submissions");
    expect(submissionsDashboard?.views.map((widget) => widget.id)).toEqual(["submissionsTable", "submissionDetail"]);
    expect(JSON.stringify(submissionsDashboard)).toContain('"type":"table"');
    expect(importedBlocs.map((bloc) => bloc.tag)).toEqual(["forms-renderer"]);
    expect(deployment?.dataApiSchemas).toEqual(["forms"]);
    expect(deployment?.functions.map((fn) => fn.name)).toEqual(["cms-forms"]);
});

test("Forms 1.0.0 bundles the modular renderer with current and legacy package runners", async () => {
    const definitions = new FsIntegrationDefinitionRepository(integrationsRoot);
    const definition = await definitions.get("forms");
    const artifact = definition?.artifacts?.find((candidate) => candidate.type === "bloc");
    expect(artifact?.type).toBe("bloc");
    if (!artifact || artifact.type !== "bloc") {
        throw new Error("Forms renderer artifact is missing");
    }

    const bloc = artifact.bloc;
    expect(bloc.view).toBe("Bloc.ts");
    const bundle = async (viewPath?: string) =>
        await prepare_bloc(
            new File([bloc.viewJS!], viewPath ?? "Bloc.js", { type: "application/javascript" }),
            new File([bloc.editorJS!], "BlocEditor.ts", { type: "application/typescript" }),
            bloc.name,
            bloc.group ?? "",
            bloc.description ?? "",
            bloc.tag,
            bloc.source,
            undefined,
            viewPath ? { viewPath } : {},
        );
    const [prepared, legacyPrepared] = await Promise.all([bundle(bloc.view), bundle()]);

    expect(prepared.id).toBe("forms-renderer");
    expect(prepared.viewJS).toContain('customElements.define("forms-renderer"');
    expect(legacyPrepared.viewJS).toContain('customElements.define("forms-renderer"');
});

test("Forms 1.0.0 verification targets its canonical package", async () => {
    const integrationPackage = await readIntegrationPackageDirectory({
        root: new URL("../", import.meta.url).pathname,
        kind: "forms",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "release-notes.txt",
    });
    const verification = await Bun.file(new URL("../../../verification/1.0.0.json", import.meta.url)).json();

    expect(verification.target).toEqual({
        kind: "forms",
        version: "1.0.0",
        packageDigest: integrationPackage.digest,
    });
});
