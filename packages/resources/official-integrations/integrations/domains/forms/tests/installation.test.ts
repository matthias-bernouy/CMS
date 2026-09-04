import { expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
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
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";

const integrationsRoot = new URL("../../..", import.meta.url).pathname;

test("Forms 3.0.0 imports only its source backend and connector", async () => {
    const definitions = new FsIntegrationDefinitionRepository(integrationsRoot);
    const definition = await definitions.get("forms");
    expect(definition).toBeTruthy();

    const sources = new InMemorySourceRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    await importIntegration(
        {
            sources,
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
        },
        { kind: "forms", answers: { id: "forms" }, options: {} },
        [definition as IntegrationDefinition],
    );

    const source = await sources.getSource("urn:forms");
    expect(source).toBeTruthy();
    expect(validateSource(source!)).toEqual([]);
    expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:forms:submitAuthenticated");

    expect(definition).toMatchObject({ version: "3.0.0", type: "source" });
    expect(definition?.artifacts?.map((artifact) => artifact.type)).toEqual(["source"]);
    expect(deployment?.dataApiSchemas).toEqual(["forms"]);
    expect(deployment?.functions.map((fn) => fn.name)).toEqual(["cms-forms"]);
});

test("Ulvia bundles the Forms renderer with current and legacy package runners", async () => {
    const definitions = new FsIntegrationDefinitionRepository(integrationsRoot);
    const definition = await definitions.get("ulvia");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "forms-renderer",
    );
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

test("retains the Forms 1.0.0 verification against its immutable package", async () => {
    const integrationPackage = (await buildOfficialIntegrationPackages()).find(
        ({ kind, version }) => kind === "forms" && version === "1.0.0",
    );
    const verification = await Bun.file(new URL("./verification/1.0.0.json", import.meta.url)).json();

    expect(verification.target).toEqual({
        kind: "forms",
        version: "1.0.0",
        packageDigest: integrationPackage?.digest,
    });
});
