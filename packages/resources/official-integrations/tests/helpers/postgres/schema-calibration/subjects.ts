import { resolve } from "node:path";
import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import {
    buildOfficialIntegrationPackages,
    loadOfficialVerificationBackfillIndex,
    OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS,
    resolveOfficialIntegrationDependencies,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";
import { type DeclarativeConnectorTemplate, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { materializeOfficialIntegrationPackage } from "../../materializedPackage";

export const OFFICIAL_SQL_INTEGRATION_KINDS = Object.freeze(
    OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS.map(({ kind }) => kind),
);

type OfficialSqlIntegrationKind = (typeof OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS)[number]["kind"];

const EXPECTED_NAMESPACES: Readonly<Record<OfficialSqlIntegrationKind, readonly string[]>> = {
    commerce: ["commerce"],
    newsletter: ["newsletter"],
    "photo-albums": ["photo_albums"],
    "sales-configurator": ["sales_configurator"],
    "user-account": ["user_account"],
    "commerce-negotiation": ["commerce_negotiation"],
    emailer: ["broadcast", "emailer"],
    "mondial-relay": ["delivery"],
    "stripe-connect": ["stripe_connect"],
};

export type SchemaCalibrationPackage = Readonly<{
    kind: string;
    version: string;
    digest: string;
}>;

export type OfficialSchemaCalibrationTarget = Readonly<{
    kind: string;
    version: string;
    connectorKey: "primary";
    lineageId: string;
    namespaces: readonly string[];
}>;

export type OfficialSchemaCalibrationSubject = SchemaCalibrationPackage &
    Readonly<{
        connector: DeclarativeConnectorTemplate;
        connectorKey: "primary";
        lineageId: string;
        namespaces: readonly string[];
        package: ResolvedIntegrationPackage;
        root: string;
        dependencies: readonly SchemaCalibrationPackage[];
        sqlInstallationOrder: readonly SchemaCalibrationPackage[];
    }>;

export async function loadOfficialSchemaCalibrationSubjects(
    root: string,
): Promise<readonly OfficialSchemaCalibrationSubject[]> {
    const packages = await buildOfficialIntegrationPackages(root);
    const backfill = await loadOfficialVerificationBackfillIndex(root);
    return loadSchemaCalibrationSubjects(
        root,
        OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS.map((target) => ({
            ...target,
            namespaces: EXPECTED_NAMESPACES[target.kind],
        })),
        packages,
        selectOfficialVerificationBackfillPackages(packages, backfill.index),
    );
}

export async function loadOfficialSchemaCalibrationRelease(
    root: string,
    target: OfficialSchemaCalibrationTarget,
): Promise<OfficialSchemaCalibrationSubject> {
    const packages = await buildOfficialIntegrationPackages(root);
    const subjects = await loadSchemaCalibrationSubjects(
        root,
        [target],
        packages,
        releaseDependencyPackages(packages, [target]),
    );
    return subjects[0]!;
}

async function loadSchemaCalibrationSubjects(
    root: string,
    targets: readonly OfficialSchemaCalibrationTarget[],
    packages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>,
    dependencyPackages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>,
): Promise<readonly OfficialSchemaCalibrationSubject[]> {
    const packageByIdentity = new Map(packages.map((entry) => [identity(entry.kind, entry.version), entry]));
    const definitions = new Map<string, IntegrationDefinition>();
    for (const entry of packages) {
        definitions.set(identity(entry.kind, entry.version), entry.definition);
    }
    const sqlKinds = new Set(
        [...definitions.values()]
            .filter((definition) => sqlConnector(definition) !== null)
            .map((definition) => definition.kind),
    );
    const subjects: OfficialSchemaCalibrationSubject[] = [];
    for (const target of targets) {
        const { kind } = target;
        const entry = packageByIdentity.get(identity(kind, target.version));
        if (!entry) {
            throw new Error(`Schema calibration requires the reviewed official ${kind}@${target.version} version`);
        }
        const definition = definitions.get(identity(entry.kind, entry.version))!;
        const connector = sqlConnector(definition);
        if (!connector) {
            throw new Error(`Official SQL integration has no SQL connector: ${kind}`);
        }
        const dependencies = resolveOfficialIntegrationDependencies(definition, dependencyPackages);
        subjects.push({
            kind: entry.kind,
            version: entry.version,
            digest: entry.digest,
            connector,
            connectorKey: target.connectorKey,
            lineageId: target.lineageId,
            namespaces: expectedNamespaces(target, connector),
            package: entry.package,
            root: await materializeOfficialIntegrationPackage(entry),
            dependencies,
            sqlInstallationOrder: dependencies.filter((dependency) => sqlKinds.has(dependency.kind)),
        });
    }
    return Object.freeze(subjects);
}

function releaseDependencyPackages(
    packages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>,
    targets: readonly OfficialSchemaCalibrationTarget[],
): Awaited<ReturnType<typeof buildOfficialIntegrationPackages>> {
    const targetVersions = new Map(targets.map(({ kind, version }) => [kind, version]));
    return packages.filter((entry) => {
        const targetVersion = targetVersions.get(entry.kind);
        return targetVersion === undefined || entry.version === targetVersion;
    });
}

function sqlConnector(definition: IntegrationDefinition): DeclarativeConnectorTemplate | null {
    const connectors = (definition.connectors ?? []).filter(
        (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
    );
    if (connectors.length > 1) {
        throw new Error(`Official integration has several SQL connectors without stable keys: ${definition.kind}`);
    }
    return connectors[0] ?? null;
}

function expectedNamespaces(
    target: OfficialSchemaCalibrationTarget,
    connector: DeclarativeConnectorTemplate,
): readonly string[] {
    const actual = [...(connector.dataApiSchemas ?? [])].sort(compareText);
    const expected = [...target.namespaces].sort(compareText);
    if (actual.join("\0") !== expected.join("\0")) {
        throw new Error(`Official SQL namespace ownership changed without review: ${target.kind}`);
    }
    return Object.freeze(actual);
}

function identity(kind: string, version: string): string {
    return `${kind}\0${version}`;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
