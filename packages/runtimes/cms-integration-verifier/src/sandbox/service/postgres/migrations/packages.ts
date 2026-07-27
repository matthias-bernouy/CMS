import { join } from "node:path";
import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies, type DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { loadSupabaseSqlSchemas, type LoadedSupabaseSqlSchema } from "@bernouy/cms-integrations/supabase";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { createBoundedPackageMaterializer } from "../../materialization";
import type { ExactMigrationPackage, LoadedMigrationPackage, TargetMigrationConnector } from "./types";

export type MigrationPackageLoader = Readonly<{
    load(entry: ExactMigrationPackage): Promise<LoadedMigrationPackage>;
    useTransient<T>(entry: ExactMigrationPackage, callback: (loaded: LoadedMigrationPackage) => Promise<T>): Promise<T>;
    dispose(): Promise<void>;
}>;

export function createMigrationPackageLoader(config: {
    packageTempRoot?: string;
    maxCachedPackages?: number;
}): MigrationPackageLoader {
    const materializer = createBoundedPackageMaterializer({
        ...config,
        maxCachedPackages: Math.max(2, config.maxCachedPackages ?? 2),
    });
    return Object.freeze({
        async load(entry) {
            return await loadExactPackage(materializer, entry);
        },
        async useTransient(entry, callback) {
            const transient = createBoundedPackageMaterializer({
                packageTempRoot: config.packageTempRoot,
                maxCachedPackages: 1,
            });
            try {
                return await callback(await loadExactPackage(transient, entry));
            } finally {
                await transient.dispose();
            }
        },
        async dispose() {
            await materializer.dispose();
        },
    });
}

async function loadExactPackage(
    materializer: ReturnType<typeof createBoundedPackageMaterializer>,
    entry: ExactMigrationPackage,
): Promise<LoadedMigrationPackage> {
    const digest = await computeIntegrationPackageDigest(entry.envelope);
    if (digest !== entry.digest) {
        throw new TypeError("Migration package bytes do not match their exact digest");
    }
    const root = await materializer.root(entry.envelope);
    const definition = await loadIntegrationDefinitionFromVersionRoot({
        definitionPath: entry.envelope.definition,
        expectedKind: entry.envelope.kind,
        expectedVersion: entry.envelope.version,
        versionRoot: root,
    });
    return { ...entry, root, definition };
}

export function exactMigrationPackageMap(
    entries: readonly ExactMigrationPackage[],
): Map<string, ExactMigrationPackage> {
    const packages = new Map(entries.map((entry) => [entry.digest, entry]));
    if (packages.size !== entries.length) {
        throw new TypeError("Migration package transport contains a duplicate digest");
    }
    return packages;
}

export function requireExactPackage(
    packages: ReadonlyMap<string, ExactMigrationPackage>,
    reference: Readonly<{ kind: string; version: string; packageDigest: string }>,
): ExactMigrationPackage {
    const entry = packages.get(reference.packageDigest);
    if (!entry || entry.envelope.kind !== reference.kind || entry.envelope.version !== reference.version) {
        throw new TypeError("Migration package transport does not contain the exact referenced package");
    }
    return entry;
}

export async function requireTargetConnector(
    target: LoadedMigrationPackage,
    input: MigrationVerificationInputV1,
): Promise<TargetMigrationConnector> {
    const matches = (target.definition.connectors ?? []).filter(
        (connector) => connector.connectorKey === input.connectorKey && connector.lineageId === input.lineageId,
    );
    const connector = matches[0];
    if (
        matches.length !== 1 ||
        !connector ||
        connector.provider !== "supabase" ||
        connector.migrationRevision !== input.targetMigrationRevision ||
        !connector.migration
    ) {
        throw new TypeError("Target package does not contain the exact planned Supabase migration connector");
    }
    const planDigest = await sha256Hex(canonicalJsonBytes(connector.migration));
    if (planDigest !== input.migrationPlan.digest) {
        throw new TypeError("Target package migration plan differs from the admitted plan");
    }
    return {
        connector: connector as TargetMigrationConnector["connector"],
        plan: input.migrationPlan.plan,
    };
}

export function requireSourceConnector(
    source: LoadedMigrationPackage,
    target: TargetMigrationConnector,
    input: MigrationVerificationInputV1,
): DeclarativeConnectorTemplate {
    const exact = (source.definition.connectors ?? []).filter(
        (connector) => connector.connectorKey === input.connectorKey && connector.lineageId === input.lineageId,
    );
    if (exact.length === 1 && exact[0]?.provider === "supabase") {
        return exact[0];
    }
    const selected = target.plan.supportedSources.find(
        (entry) =>
            entry.migrationRevision === input.sourceMigrationRevision &&
            integrationVersionSatisfies(input.source.version, entry.range),
    );
    if (!selected?.legacyAdoption) {
        throw new TypeError("Source package has no exact connector identity or reviewed legacy adoption mapping");
    }
    const legacy = (source.definition.connectors ?? []).filter(
        (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
    );
    if (legacy.length !== 1) {
        throw new TypeError("Legacy source package does not identify one unambiguous Supabase SQL connector");
    }
    return legacy[0]!;
}

export async function loadConnectorSchemas(
    loaded: LoadedMigrationPackage,
    connector: DeclarativeConnectorTemplate,
): Promise<LoadedSupabaseSqlSchema[]> {
    if (!connector.schemas?.length) {
        throw new TypeError("Migration verification requires connector install SQL");
    }
    return await loadSupabaseSqlSchemas(join(loaded.root, connector.root ?? "."), connector.schemas);
}
