import {
    integrationVersionReleaseLevel,
    type DeclarativeConnectorMigrationDescriptor,
    type DeclarativeConnectorMigrationPlan,
    type DeclarativeConnectorMigrationSource,
} from "@bernouy/cms-integrations";
import { strictRecord } from "../../../validation/structure";
import { oneOf } from "../../../validation/values";
import { identifyCanonicalVerificationContract } from "../../shared";
import { invalid } from "../shared";
import { parseMigrationInstall, parseMigrations, parseRepeatables } from "./descriptors";
import { parseCmsMediatedCutover, parseMigrationSources, parseProviderDirectCutover } from "./sources";

export async function identifyMigrationVerificationPlan(
    value: unknown,
    targetVersion: string,
    targetMigrationRevision: number,
): Promise<Readonly<{ plan: DeclarativeConnectorMigrationPlan; canonicalBytes: Uint8Array; digest: string }>> {
    const input = strictRecord(value, "migrationVerificationInput.migrationPlan.plan", [
        "install",
        "migrations",
        "repeatables",
        "supportedSources",
        "cmsMediated",
        "providerDirect",
        "pointOfNoReturn",
    ]);
    const install = parseMigrationInstall(input.install, "migrationVerificationInput.migrationPlan.plan.install");
    const migrations = parseMigrations(input.migrations, "migrationVerificationInput.migrationPlan.plan.migrations");
    const repeatables = parseRepeatables(
        input.repeatables,
        "migrationVerificationInput.migrationPlan.plan.repeatables",
    );
    const supportedSources = parseMigrationSources(
        input.supportedSources,
        "migrationVerificationInput.migrationPlan.plan.supportedSources",
    );
    const cmsMediated = parseCmsMediatedCutover(
        input.cmsMediated,
        "migrationVerificationInput.migrationPlan.plan.cmsMediated",
    );
    const providerDirect = parseProviderDirectCutover(
        input.providerDirect,
        "migrationVerificationInput.migrationPlan.plan.providerDirect",
    );
    const plan: DeclarativeConnectorMigrationPlan = {
        install,
        migrations,
        ...(repeatables.length ? { repeatables } : {}),
        supportedSources,
        ...(cmsMediated ? { cmsMediated } : {}),
        ...(providerDirect ? { providerDirect } : {}),
        pointOfNoReturn: oneOf(input.pointOfNoReturn, "migrationVerificationInput.migrationPlan.plan.pointOfNoReturn", [
            "before-contract",
        ] as const),
    };
    assertPlan(plan, targetVersion, targetMigrationRevision);
    const identified = await identifyCanonicalVerificationContract(plan);
    return { plan, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function assertPlan(
    plan: DeclarativeConnectorMigrationPlan,
    targetVersion: string,
    targetMigrationRevision: number,
): void {
    const field = "migrationVerificationInput.migrationPlan.plan";
    if (plan.install.revision !== targetMigrationRevision) {
        invalid(`${field}.install.revision`, "must equal targetMigrationRevision");
    }
    for (let index = 0; index < plan.migrations.length; index += 1) {
        const migration = plan.migrations[index]!;
        const previous = plan.migrations[index - 1];
        if (previous && migration.fromRevision !== previous.toRevision) {
            invalid(`${field}.migrations`, "must form one contiguous revision chain");
        }
        if (migration.toRevision > targetMigrationRevision) {
            invalid(`${field}.migrations`, "must not advance beyond targetMigrationRevision");
        }
        if (
            migration.introducedIn !== targetVersion &&
            !integrationVersionReleaseLevel(migration.introducedIn, targetVersion)
        ) {
            invalid(`${field}.migrations.${index}.introducedIn`, "must not be newer than the target version");
        }
    }
    for (const source of plan.supportedSources) {
        assertSourceChain(source, plan.migrations, targetMigrationRevision, field);
    }
    assertCoveredMigrations(plan, field);
}

function assertSourceChain(
    source: DeclarativeConnectorMigrationSource,
    migrations: readonly DeclarativeConnectorMigrationDescriptor[],
    targetRevision: number,
    field: string,
): void {
    if (source.migrationRevision > targetRevision) {
        invalid(`${field}.supportedSources`, "must not start after targetMigrationRevision");
    }
    let revision = source.migrationRevision;
    let contractStarted = false;
    for (const migration of migrations.filter(
        (entry) => entry.toRevision > source.migrationRevision && entry.toRevision <= targetRevision,
    )) {
        if (migration.fromRevision !== revision) {
            invalid(`${field}.supportedSources`, `has no continuous chain from revision ${source.migrationRevision}`);
        }
        contractStarted ||= migration.phase === "contract";
        if (contractStarted && migration.phase === "expand") {
            invalid(`${field}.migrations`, "must place expand migrations before contract migrations");
        }
        revision = migration.toRevision;
    }
    if (revision !== targetRevision) {
        invalid(`${field}.supportedSources`, `chain stops at revision ${revision}, expected ${targetRevision}`);
    }
}

function assertCoveredMigrations(plan: DeclarativeConnectorMigrationPlan, field: string): void {
    const covered = new Map(plan.install.coveredMigrations.map((entry) => [entry.id, entry]));
    if (covered.size !== plan.migrations.length) {
        invalid(`${field}.install.coveredMigrations`, "must reference every and only declared migration");
    }
    for (const migration of plan.migrations) {
        const reference = covered.get(migration.id);
        if (
            !reference ||
            reference.checksum !== migration.checksum ||
            reference.revision !== migration.toRevision ||
            reference.introducedIn !== migration.introducedIn
        ) {
            invalid(`${field}.install.coveredMigrations`, `must exactly cover migration ${migration.id}`);
        }
    }
}
