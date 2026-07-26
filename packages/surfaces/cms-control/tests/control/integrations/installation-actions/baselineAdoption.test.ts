import { describe, expect, test } from "bun:test";
import {
    identifyObservedSchemaContract,
    legacyBaselineAdoptionConfirmation,
    type IntegrationConnectorBaselineAdopter,
    type IntegrationDefinition,
    type ObservedSchemaContractV1,
} from "@bernouy/cms-integrations";
import postIntegrationBaselineAdoption from "cms-control/api/_platform/integrations/installations/adopt-baseline.post";
import { integrationDefinitionRepository, makeCms } from "../support/helpers";

const SOURCE_DIGEST = "a".repeat(64);
const TARGET_DIGEST = "b".repeat(64);
const BASELINE: ObservedSchemaContractV1 = {
    schema: "cms.integration.observed-schema.v1",
    owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
    namespaces: [{ name: "commerce", relations: [] }],
};

describe("POST integration legacy baseline adoption", () => {
    test("rejects a forged direct handler call from a non-administrator before repository access", async () => {
        const fixture = await controlFixture("user");

        await expect(postIntegrationBaselineAdoption(request(), fixture.cms)).rejects.toMatchObject({ status: 403 });
        expect(fixture.catalogReads).toBe(0);
        expect(fixture.resolutions).toBe(0);
        expect(fixture.adoptions).toBe(0);
    });

    test("rejects a blocked target before package resolution or external adoption", async () => {
        const fixture = await controlFixture("admin", "blocked");

        await expect(postIntegrationBaselineAdoption(request(), fixture.cms)).rejects.toThrow(/blocked/);
        expect(fixture.resolutions).toBe(0);
        expect(fixture.adoptions).toBe(0);
    });

    test("rejects stale installed provenance before selecting an upgrade target", async () => {
        const fixture = await controlFixture("admin");

        await expect(
            postIntegrationBaselineAdoption(request({ sourcePackageDigest: "c".repeat(64) }), fixture.cms),
        ).rejects.toThrow(/no longer matches/);
        expect(fixture.catalogReads).toBe(0);
        expect(fixture.resolutions).toBe(0);
        expect(fixture.adoptions).toBe(0);
    });

    test("resolves an eligible immutable package and records the authenticated administrator", async () => {
        const fixture = await controlFixture("admin");

        const response = await postIntegrationBaselineAdoption(request(), fixture.cms);
        const body = (await response.json()) as { audit: { actor: string; targetPackageDigest: string } };

        expect(response.status).toBe(200);
        expect(fixture.resolutions).toBe(1);
        expect(fixture.adoptions).toBe(1);
        expect(body.audit).toMatchObject({ actor: "subject-admin", targetPackageDigest: TARGET_DIGEST });
        expect((await fixture.installations.get("commerce"))?.connectorBindings?.primary).toBeDefined();
    });
});

async function controlFixture(role: "admin" | "user", targetStatus?: "blocked") {
    const source: IntegrationDefinition = { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
    const target = targetDefinition();
    const fixture = makeCms([source, target]);
    await fixture.integrationInstallations.create({
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.0.0",
        definitionSnapshot: source,
        packageDigest: SOURCE_DIGEST,
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
    let catalogReads = 0;
    const catalogue = integrationDefinitionRepository([source, target]);
    const originalGetIndex = catalogue.getIndex.bind(catalogue);
    catalogue.getIndex = async (kind) => {
        catalogReads++;
        const index = await originalGetIndex(kind);
        return index && targetStatus
            ? {
                  ...index,
                  versions: index.versions.map((version) =>
                      version.version === "1.1.0" ? { ...version, status: targetStatus } : version,
                  ),
              }
            : index;
    };
    let resolutions = 0;
    let adoptions = 0;
    const adopter: IntegrationConnectorBaselineAdopter = {
        provider: "supabase",
        async adopt(context) {
            adoptions++;
            return {
                baselineDigest: (await identifyObservedSchemaContract(BASELINE)).digest,
                externalOperationId: "remote-adoption",
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            };
        },
    };
    Object.assign(fixture.cms, {
        auth: authentication(role),
        integrationCatalog: catalogue,
        integrationPackageResolver: {
            async resolve() {
                resolutions++;
                return {
                    root: "/tmp/commerce-1.1.0",
                    kind: "commerce",
                    version: "1.1.0",
                    digest: TARGET_DIGEST,
                    definition: target,
                };
            },
        },
        integrationConnectorBaselineAdopters: [adopter],
    });
    return {
        cms: fixture.cms,
        installations: fixture.integrationInstallations,
        get catalogReads() {
            return catalogReads;
        },
        get resolutions() {
            return resolutions;
        },
        get adoptions() {
            return adoptions;
        },
    };
}

function targetDefinition(): IntegrationDefinition {
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                lineageId: "commerce-supabase-v1",
                migrationRevision: 2,
                migration: {
                    install: { revision: 2, digest: `sha256:${"d".repeat(64)}`, coveredMigrations: [] },
                    migrations: [],
                    supportedSources: [
                        {
                            range: "^1.0.0",
                            migrationRevision: 1,
                            legacyAdoption: {
                                definitionVersion: "1.0.0",
                                packageDigest: SOURCE_DIGEST,
                                observedSchema: BASELINE,
                                coveredMigrations: [],
                            },
                        },
                    ],
                    pointOfNoReturn: "before-contract",
                },
            },
        ],
    };
}

function request(overrides: Record<string, unknown> = {}): Request {
    return new Request("http://control.test/api/integrations/installations/adopt-baseline?id=commerce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            version: "1.1.0",
            connectorKey: "primary",
            sourceVersion: "1.0.0",
            sourcePackageDigest: SOURCE_DIGEST,
            confirmation: legacyBaselineAdoptionConfirmation({
                integrationId: "commerce",
                sourceVersion: "1.0.0",
                sourcePackageDigest: SOURCE_DIGEST,
                targetVersion: "1.1.0",
                targetPackageDigest: TARGET_DIGEST,
                connectorKey: "primary",
            }),
            ...overrides,
        }),
    });
}

function authentication(role: "admin" | "user") {
    return {
        loginUrl: "/login",
        logoutUrl: "/logout",
        profileUrl: "/profile",
        buildLoginUrl: () => "/login",
        buildLogoutUrl: () => "/logout",
        getSubject: async () => ({ identifier: `subject-${role}`, role }),
    };
}
