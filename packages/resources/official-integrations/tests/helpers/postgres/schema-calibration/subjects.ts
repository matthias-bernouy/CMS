import { resolve } from "node:path";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import {
    integrationVersionSatisfies,
    type DeclarativeConnectorTemplate,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { compare as compareVersions } from "semver";

export const OFFICIAL_SQL_INTEGRATION_KINDS = Object.freeze([
    "commerce",
    "newsletter",
    "photo-albums",
    "sales-configurator",
    "user-account",
    "commerce-negotiation",
    "emailer",
    "mondial-relay",
    "stripe-connect",
] as const);

const EXPECTED_NAMESPACES: Readonly<Record<(typeof OFFICIAL_SQL_INTEGRATION_KINDS)[number], readonly string[]>> = {
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

export type OfficialSchemaCalibrationSubject = SchemaCalibrationPackage &
    Readonly<{
        connector: DeclarativeConnectorTemplate;
        connectorKey: "primary";
        lineageId: string;
        namespaces: readonly string[];
        root: string;
        dependencies: readonly SchemaCalibrationPackage[];
        sqlInstallationOrder: readonly SchemaCalibrationPackage[];
    }>;

export async function loadOfficialSchemaCalibrationSubjects(
    root: string,
): Promise<readonly OfficialSchemaCalibrationSubject[]> {
    const repository = new FsIntegrationDefinitionRepository(root);
    const packages = await buildOfficialIntegrationPackages(root);
    const packageByIdentity = new Map(packages.map((entry) => [identity(entry.kind, entry.version), entry]));
    const definitions = new Map<string, IntegrationDefinition>();
    for (const entry of packages) {
        const definition = await repository.get(entry.kind, entry.version);
        if (!definition) {
            throw new Error(`Official package definition disappeared: ${entry.kind}@${entry.version}`);
        }
        definitions.set(identity(entry.kind, entry.version), definition);
    }
    const sqlKinds = new Set(
        [...definitions.values()]
            .filter((definition) => sqlConnector(definition) !== null)
            .map((definition) => definition.kind),
    );
    assertExpectedSqlKinds(sqlKinds);
    const subjects: OfficialSchemaCalibrationSubject[] = [];
    for (const kind of OFFICIAL_SQL_INTEGRATION_KINDS) {
        const matches = packages
            .filter((entry) => entry.kind === kind)
            .sort((left, right) => compareVersions(right.version, left.version));
        if (matches.length !== 1) {
            throw new Error(`Schema calibration requires exactly one official ${kind} version`);
        }
        const entry = matches[0]!;
        const definition = definitions.get(identity(entry.kind, entry.version))!;
        const connector = sqlConnector(definition);
        if (!connector) {
            throw new Error(`Official SQL integration has no SQL connector: ${kind}`);
        }
        const location = await repository.locateExactVersion(entry.kind, entry.version);
        if (!location) {
            throw new Error(`Official package location disappeared: ${entry.kind}@${entry.version}`);
        }
        const dependencies = resolveDependencies(definition, packages, definitions);
        subjects.push({
            kind: entry.kind,
            version: entry.version,
            digest: entry.digest,
            connector,
            connectorKey: "primary",
            lineageId: `${entry.kind}-supabase-v1`,
            namespaces: expectedNamespaces(kind, connector),
            root: location.root,
            dependencies,
            sqlInstallationOrder: dependencies.filter((dependency) => sqlKinds.has(dependency.kind)),
        });
    }
    return Object.freeze(subjects);
}

function resolveDependencies(
    definition: IntegrationDefinition,
    packages: readonly SchemaCalibrationPackage[],
    definitions: ReadonlyMap<string, IntegrationDefinition>,
): readonly SchemaCalibrationPackage[] {
    const resolved: SchemaCalibrationPackage[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (current: IntegrationDefinition): void => {
        for (const dependency of current.dependencies ?? []) {
            if (dependency.optional) {
                continue;
            }
            const selected = packages
                .filter(
                    (entry) =>
                        entry.kind === dependency.kind &&
                        (!dependency.versionRange ||
                            integrationVersionSatisfies(entry.version, dependency.versionRange)),
                )
                .sort((left, right) => compareVersions(right.version, left.version))[0];
            if (!selected) {
                throw new Error(
                    `Required official dependency cannot be resolved: ${current.kind} -> ${dependency.kind}`,
                );
            }
            const key = identity(selected.kind, selected.version);
            if (visited.has(key)) {
                continue;
            }
            if (visiting.has(key)) {
                throw new Error(`Required official dependency cycle includes ${key.replace("\0", "@")}`);
            }
            const selectedDefinition = definitions.get(key);
            if (!selectedDefinition) {
                throw new Error(`Required official dependency definition is missing: ${key.replace("\0", "@")}`);
            }
            visiting.add(key);
            visit(selectedDefinition);
            visiting.delete(key);
            visited.add(key);
            resolved.push(selected);
        }
    };
    visit(definition);
    return Object.freeze(resolved);
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
    kind: (typeof OFFICIAL_SQL_INTEGRATION_KINDS)[number],
    connector: DeclarativeConnectorTemplate,
): readonly string[] {
    const actual = [...(connector.dataApiSchemas ?? [])].sort(compareText);
    const expected = [...EXPECTED_NAMESPACES[kind]].sort(compareText);
    if (actual.join("\0") !== expected.join("\0")) {
        throw new Error(`Official SQL namespace ownership changed without review: ${kind}`);
    }
    return Object.freeze(actual);
}

function assertExpectedSqlKinds(actual: ReadonlySet<string>): void {
    const expected = new Set<string>(OFFICIAL_SQL_INTEGRATION_KINDS);
    if (actual.size !== expected.size || [...actual].some((kind) => !expected.has(kind))) {
        throw new Error("Official SQL integration inventory changed without schema calibration review");
    }
}

function identity(kind: string, version: string): string {
    return `${kind}\0${version}`;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
