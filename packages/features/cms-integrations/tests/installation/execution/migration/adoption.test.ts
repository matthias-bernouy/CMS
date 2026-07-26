import { describe, expect, test } from "bun:test";
import {
    adoptLegacyConnectorBaseline,
    InMemoryIntegrationInstallationRepository,
    legacyBaselineAdoptionConfirmation,
    type IntegrationConnectorBaselineAdopter,
    type IntegrationDefinition,
    type ObservedSchemaContractV1,
} from "@bernouy/cms-integrations";

const SOURCE_DIGEST = "a".repeat(64);
const TARGET_DIGEST = "b".repeat(64);
const BASELINE: ObservedSchemaContractV1 = {
    schema: "cms.integration.observed-schema.v1",
    owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
    namespaces: [{ name: "commerce", relations: [] }],
};

describe("explicit legacy connector baseline adoption", () => {
    test("persists one deterministic connector identity and an administrator audit", async () => {
        const fixture = await adoptionFixture();
        const result = await adoptLegacyConnectorBaseline({
            ...fixture.request,
            actor: "admin-42",
            confirmation: confirmation(),
        });

        expect(fixture.contexts).toHaveLength(1);
        expect(fixture.contexts[0]).toMatchObject({
            integrationKind: "commerce",
            sourceVersion: "1.0.0",
            sourcePackageDigest: SOURCE_DIGEST,
            targetVersion: "1.1.0",
            targetPackageDigest: TARGET_DIGEST,
            connectorKey: "primary",
            lineageId: "commerce-supabase-v1",
            migrationRevision: 1,
            baseline: { coveredMigrations: [] },
        });
        expect(fixture.contexts[0]?.connectorInstanceId).toMatch(/^cms-[a-f0-9]{64}$/);
        expect(result.installation.connectorBindings?.primary).toMatchObject({
            connectorInstanceId: fixture.contexts[0]?.connectorInstanceId,
            migrationRevision: 1,
            outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
        });
        expect(result.audit).toMatchObject({
            actor: "admin-42",
            sourceDefinitionVersion: "1.0.0",
            sourcePackageDigest: SOURCE_DIGEST,
            targetDefinitionVersion: "1.1.0",
            targetPackageDigest: TARGET_DIGEST,
            connectorInstanceId: fixture.contexts[0]?.connectorInstanceId,
            externalOperationId: "remote-adoption",
        });
    });

    test("advances the CAS revision even when the wall clock has not moved", async () => {
        const fixture = await adoptionFixture();
        const current = fixture.request.installation.updatedAt;
        const result = await adoptLegacyConnectorBaseline({
            ...fixture.request,
            actor: "admin-42",
            confirmation: confirmation(),
            clock: { now: () => new Date(current) },
        });

        expect(result.installation.updatedAt.getTime()).toBe(current.getTime() + 1);
    });

    test("rejects stale or forged confirmation before any external mutation", async () => {
        const fixture = await adoptionFixture();

        await expect(
            adoptLegacyConnectorBaseline({
                ...fixture.request,
                actor: "admin-42",
                confirmation: confirmation().replace(TARGET_DIGEST, "c".repeat(64)),
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fixture.contexts).toHaveLength(0);
        expect((await fixture.installations.get("commerce"))?.connectorBindings).toBeUndefined();
    });

    test("fails closed when the target has no baseline for the exact installed digest", async () => {
        const fixture = await adoptionFixture("c".repeat(64));

        await expect(
            adoptLegacyConnectorBaseline({
                ...fixture.request,
                actor: "admin-42",
                confirmation: confirmation(),
            }),
        ).rejects.toThrow(/exact legacy baseline/);
        expect(fixture.contexts).toHaveLength(0);
    });

    test("requires compare-and-swap persistence before calling an adopter", async () => {
        const fixture = await adoptionFixture();
        const repository = { ...fixture.installations, compareAndSwapMigration: undefined } as never;

        await expect(
            adoptLegacyConnectorBaseline({
                ...fixture.request,
                installations: repository,
                actor: "admin-42",
                confirmation: confirmation(),
            }),
        ).rejects.toMatchObject({ status: 503 });
        expect(fixture.contexts).toHaveLength(0);
    });

    test("rejects forged adoption provenance on every installation write", async () => {
        const fixture = await adoptionFixture();
        const adopted = await adoptLegacyConnectorBaseline({
            ...fixture.request,
            actor: "admin-42",
            confirmation: confirmation(),
        });
        const forged = structuredClone(adopted.installation);
        forged.connectorBaselineAdoptions![0]!.baselineDigest = "not-a-digest";

        await expect(fixture.installations.replace(forged)).rejects.toThrow(/adoption provenance is invalid/);
    });
});

async function adoptionFixture(declaredSourceDigest = SOURCE_DIGEST) {
    const installations = new InMemoryIntegrationInstallationRepository();
    const source: IntegrationDefinition = { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
    const installation = await installations.create({
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
    const target = targetDefinition(declaredSourceDigest);
    const contexts: Array<Record<string, unknown>> = [];
    const adopter: IntegrationConnectorBaselineAdopter = {
        provider: "supabase",
        async adopt(context) {
            contexts.push(context);
            return {
                baselineDigest: await observedDigest(),
                externalOperationId: "remote-adoption",
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            };
        },
    };
    return {
        installations,
        contexts,
        request: {
            installations,
            installation,
            targetPackage: {
                root: "/tmp/commerce-1.1.0",
                kind: "commerce",
                version: "1.1.0",
                digest: TARGET_DIGEST,
                definition: target,
            },
            connectorKey: "primary",
            adopters: [adopter],
        },
    };
}

function targetDefinition(declaredSourceDigest: string): IntegrationDefinition {
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
                                packageDigest: declaredSourceDigest,
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

function confirmation(): string {
    return legacyBaselineAdoptionConfirmation({
        integrationId: "commerce",
        sourceVersion: "1.0.0",
        sourcePackageDigest: SOURCE_DIGEST,
        targetVersion: "1.1.0",
        targetPackageDigest: TARGET_DIGEST,
        connectorKey: "primary",
    });
}

async function observedDigest(): Promise<string> {
    const { identifyObservedSchemaContract } = await import("@bernouy/cms-integrations");
    return (await identifyObservedSchemaContract(BASELINE)).digest;
}
