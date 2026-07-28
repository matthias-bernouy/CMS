import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import postIntegrationInstallationRerun from "cms-control/api/_platform/integrations/installations/rerun.post";
import postIntegrationInstallationUpgrade from "cms-control/api/_platform/integrations/installations/upgrade.post";
import {
    makeCms,
    postImport,
    postRerun,
    postUpgrade,
    recordingPackageResolver,
    TEST_SECRET_SOURCE_DEFINITION,
} from "../support/helpers";

const INSTALLATION_ID = "test-secret-source";

describe("integration installation package resolver", () => {
    test("injects the resolver on a snapshot-backed rerun without reading the catalogue", async () => {
        const { cms, integrationInstallations } = makeCms();
        await install(cms);
        cms.integrationCatalog = unavailableCatalog(cms.integrationCatalog);
        const { resolver, requests } = recordingPackageResolver();
        cms.integrationPackageResolver = resolver;

        const response = await postIntegrationInstallationRerun(postRerun(INSTALLATION_ID), cms);

        expect(response.status).toBe(200);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            kind: INSTALLATION_ID,
            version: "1.0.0",
            reason: "rerun",
            allowEmbeddedFallback: true,
            expectedDefinition: TEST_SECRET_SOURCE_DEFINITION,
        });
        expect((await integrationInstallations.get(INSTALLATION_ID))?.packageDigest).toBe("a".repeat(64));
    });

    test("reconstructs a legacy exact definition through the resolver without catalogue access", async () => {
        const { cms, integrationInstallations } = makeCms();
        await install(cms);
        const installed = await requiredInstallation(integrationInstallations);
        await integrationInstallations.replace({ ...installed, definitionSnapshot: undefined });
        cms.integrationCatalog = unavailableCatalog(cms.integrationCatalog);
        const { resolver, requests } = recordingPackageResolver();
        cms.integrationPackageResolver = resolver;

        const response = await postIntegrationInstallationRerun(postRerun(INSTALLATION_ID), cms);

        expect(response.status).toBe(200);
        expect(requests[0]).toMatchObject({
            reason: "rerun",
            expectedDigest: undefined,
            expectedDefinition: undefined,
            allowEmbeddedFallback: true,
        });
        const rerunInstallation = await requiredInstallation(integrationInstallations);
        expect(rerunInstallation.definitionSnapshot).toBeUndefined();
        expect(rerunInstallation.packageDigest).toBe("a".repeat(64));
    });

    test("propagates structured resolver failures without changing the installation", async () => {
        const { cms, integrationInstallations } = makeCms();
        await install(cms);
        const before = await requiredInstallation(integrationInstallations);
        cms.integrationCatalog = unavailableCatalog(cms.integrationCatalog);
        cms.integrationPackageResolver = {
            resolve: async () => {
                throw new IntegrationRepositoryUnavailableError();
            },
        };

        await expect(postIntegrationInstallationRerun(postRerun(INSTALLATION_ID), cms)).rejects.toMatchObject({
            name: "IntegrationRepositoryUnavailableError",
            status: 503,
            publicCode: "integration_repository_unavailable",
        });
        expect(await requiredInstallation(integrationInstallations)).toEqual(before);
    });

    test("injects the resolver on upgrade and commits its package digest", async () => {
        const target = { ...TEST_SECRET_SOURCE_DEFINITION, version: "1.1.0", label: "Upgraded source" };
        const { cms, integrationInstallations } = makeCms([TEST_SECRET_SOURCE_DEFINITION, target]);
        await install(cms);
        const { resolver, requests } = recordingPackageResolver(() => target);
        cms.integrationPackageResolver = resolver;

        const response = await postIntegrationInstallationUpgrade(
            postUpgrade(INSTALLATION_ID, { version: "1.1.0" }),
            cms,
        );

        expect(response.status).toBe(200);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            kind: INSTALLATION_ID,
            version: "1.1.0",
            reason: "upgrade",
            allowEmbeddedFallback: false,
            expectedDefinition: target,
        });
        const upgraded = await requiredInstallation(integrationInstallations);
        expect(upgraded.definitionVersion).toBe("1.1.0");
        expect(upgraded.packageDigest).toBe("a".repeat(64));
    });
});

async function install(cms: any): Promise<void> {
    await postIntegrationImport(
        postImport({
            kind: INSTALLATION_ID,
            answers: { id: "secret-source-main", apiKey: "sk_test" },
        }),
        cms,
    );
}

async function requiredInstallation(repository: any) {
    const installation = await repository.get(INSTALLATION_ID);
    if (!installation) {
        throw new Error("expected the test installation");
    }
    return installation;
}

function unavailableCatalog(catalogue: any) {
    return {
        ...catalogue,
        get: async () => {
            throw new Error("the package resolver should avoid catalogue access");
        },
    };
}
