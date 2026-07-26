import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    buildOfficialIntegrationPackages,
    buildOfficialRepositoryBootstrapPlan,
    loadOfficialRepositoryBootstrapEvidence,
    OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH,
    OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS,
    OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST,
    OFFICIAL_SCHEMA_BASELINE_GENERATOR,
    OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE,
    OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION,
} from "@bernouy/cms-official-integrations/publication";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { schemaCalibrationEnvironmentIdentity } from "../../environment/manifest";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official reviewed schema baseline evidence", () => {
    test("closes the exact package, SQL identity, environment, and legacy finding set", async () => {
        const environment = await schemaCalibrationEnvironmentIdentity();
        const plan = await buildOfficialRepositoryBootstrapPlan();
        const packageByIdentity = new Map(
            plan.packages.map(({ package: integrationPackage }) => [
                `${integrationPackage.envelope.kind}@${integrationPackage.envelope.version}`,
                integrationPackage,
            ]),
        );

        expect(environment.digest).toBe(OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST);
        expect(plan.packages).toHaveLength(14);
        expect(plan.reviewedSchemaBaselines).toHaveLength(OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS.length);
        expect(
            plan.reviewedSchemaBaselines.map(({ kind, version, connectorKey, lineageId }) => ({
                kind,
                version,
                connectorKey,
                lineageId,
            })),
        ).toEqual([...OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS].sort(compareTargets));
        for (const baseline of plan.reviewedSchemaBaselines) {
            expect(packageByIdentity.get(`${baseline.kind}@${baseline.version}`)?.digest).toBe(baseline.packageDigest);
            expect(baseline.generator).toEqual(OFFICIAL_SCHEMA_BASELINE_GENERATOR);
            expect(baseline.environment.digest).toBe(environment.digest);
            expect(baseline.environment.postgresVersion).toBe(OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION);
            expect(baseline.dependencies).toEqual([...baseline.dependencies].sort(compareDependencies));
        }
        expect(
            plan.packages
                .flatMap(({ anonymousConstraintGrandfathering }) => anonymousConstraintGrandfathering)
                .flatMap(({ findings }) => findings),
        ).toHaveLength(59);
        expect(OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE).toEndWith(
            `@${OFFICIAL_SCHEMA_BASELINE_GENERATOR.imageDigest}`,
        );
    });

    test("rejects a reviewed baseline moved away from its exact same-tree package digest", async () => {
        const root = await copiedOfficialRoot();
        const evidence = await evidenceDocument(root);
        evidence.reviewedSchemaBaselines[0]!.packageDigest = "f".repeat(64);
        await writeEvidence(root, evidence);

        await expect(buildOfficialRepositoryBootstrapPlan(root)).rejects.toThrow("exact package digest");
    });

    test("rejects grandfathering after either its exact location or package bytes change", async () => {
        const movedRoot = await copiedOfficialRoot();
        const movedEvidence = await evidenceDocument(movedRoot);
        movedEvidence.anonymousConstraintGrandfathering[0]!.findings[0]!.line += 1;
        await writeEvidence(movedRoot, movedEvidence);
        await expect(buildOfficialRepositoryBootstrapPlan(movedRoot)).rejects.toThrow("exact package bytes");

        const changedRoot = await copiedOfficialRoot();
        const changedEvidence = await loadOfficialRepositoryBootstrapEvidence(changedRoot);
        const approved = changedEvidence.anonymousConstraintGrandfathering[0]!;
        const packages = await buildOfficialIntegrationPackages(changedRoot);
        const integrationPackage = packages.find(({ digest }) => digest === approved.packageDigest)!;
        const versionRoot = await new FsIntegrationDefinitionRepository(changedRoot).locateExactVersion(
            integrationPackage.kind,
            integrationPackage.version,
        );
        await appendFile(join(versionRoot!.root, approved.path), "\n-- package digest changed\n");
        await expect(buildOfficialRepositoryBootstrapPlan(changedRoot)).rejects.toThrow(
            /package digest|absent package/,
        );
    });

    test("rejects incomplete dependencies, a divergent connector selector, and an unapproved PostgreSQL version", async () => {
        const dependencyRoot = await copiedOfficialRoot();
        const dependencyEvidence = await evidenceDocument(dependencyRoot);
        const dependent = dependencyEvidence.reviewedSchemaBaselines.find(
            ({ dependencies }) => dependencies.length > 0,
        )!;
        dependent.dependencies.pop();
        await writeEvidence(dependencyRoot, dependencyEvidence);
        await expect(buildOfficialRepositoryBootstrapPlan(dependencyRoot)).rejects.toThrow(
            "dependencies are incomplete",
        );

        const selectorRoot = await copiedOfficialRoot();
        const selectorEvidence = await evidenceDocument(selectorRoot);
        selectorEvidence.reviewedSchemaBaselines[0]!.legacySelector.root = "connectors/not-the-reviewed-root";
        await writeEvidence(selectorRoot, selectorEvidence);
        await expect(buildOfficialRepositoryBootstrapPlan(selectorRoot)).rejects.toThrow("exact SQL connector");

        const postgresRoot = await copiedOfficialRoot();
        const postgresEvidence = await evidenceDocument(postgresRoot);
        postgresEvidence.reviewedSchemaBaselines[0]!.environment.postgresVersion = "160013";
        await writeEvidence(postgresRoot, postgresEvidence);
        await expect(buildOfficialRepositoryBootstrapPlan(postgresRoot)).rejects.toThrow("provenance is not approved");
    });
});

type MutableEvidence = {
    reviewedSchemaBaselines: Array<{
        packageDigest: string;
        dependencies: Array<{ kind: string; version: string; packageDigest: string }>;
        legacySelector: { provider: string; root?: string };
        environment: { digest: string; postgresVersion: string };
    }>;
    anonymousConstraintGrandfathering: Array<{ findings: Array<{ line: number }> }>;
};

async function copiedOfficialRoot(): Promise<string> {
    const temporary = await mkdtemp(join(tmpdir(), "cms-official-baselines-"));
    temporaryRoots.push(temporary);
    const root = join(temporary, "integrations");
    await cp(OFFICIAL_INTEGRATIONS_ROOT, root, { recursive: true });
    return root;
}

async function evidenceDocument(root: string): Promise<MutableEvidence> {
    return JSON.parse(await readFile(join(root, OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH), "utf8"));
}

async function writeEvidence(root: string, evidence: MutableEvidence): Promise<void> {
    await writeFile(join(root, OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH), canonicalJsonBytes(evidence));
}

function compareTargets(
    left: (typeof OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS)[number],
    right: (typeof OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS)[number],
): number {
    return compareText(left.kind, right.kind) || compareText(left.version, right.version);
}

function compareDependencies(
    left: Readonly<{ kind: string; version: string; packageDigest: string }>,
    right: Readonly<{ kind: string; version: string; packageDigest: string }>,
): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.packageDigest, right.packageDigest)
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
