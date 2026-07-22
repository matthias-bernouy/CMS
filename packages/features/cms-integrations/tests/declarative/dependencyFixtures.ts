import { InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";

export async function installProductsDependency(
    installations: InMemoryIntegrationInstallationRepository,
): Promise<void> {
    await installations.create({
        id: "products",
        label: "Products",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id: "catalog", public: true },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:catalog", action: "created" }],
        runs: [],
    });
}

export async function installLegacySecretDependency(
    installations: InMemoryIntegrationInstallationRepository,
): Promise<void> {
    await installations.create({
        id: "products",
        label: "Products",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {
            id: "catalog",
            cmsApiKey: "legacy-ref-secret",
            legacyPassword: "legacy-password",
        },
        secretRefs: { cmsApiKey: "PRODUCTS_API_KEY" },
        secretInputs: [],
        definitionSnapshot: {
            kind: "products",
            label: "Products",
            inputs: [
                {
                    name: "legacyPassword",
                    label: "Legacy password",
                    type: "password",
                    required: true,
                    secret: true,
                },
            ],
        },
        artifacts: [{ type: "source", id: "urn:catalog", action: "created" }],
        runs: [],
    });
}
