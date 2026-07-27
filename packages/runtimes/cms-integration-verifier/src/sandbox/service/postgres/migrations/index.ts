import { SQL } from "bun";
import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import { type MigrationJobResultV1, type MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { executeMigrationMatrix } from "./execution";
import { inMigrationVerificationPhase } from "./execution/phases";
import { createMigrationPackageLoader, exactMigrationPackageMap, requireExactPackage } from "./packages";
import {
    assertDisposableMigrationTarget,
    attestTrustedEnvironment,
    establishTrustedBaseline,
    restoreTrustedBaseline,
} from "./reset";
import { failedResult, successfulResult } from "./results";
import { matrixEvidenceDigest } from "./state";
import type { MatrixMigrationEvidence, MigrationVerificationExecutionInput } from "./types";

export function createPostgresMigrationVerifier(config: { packageTempRoot?: string; maxCachedPackages?: number }) {
    const activeLoaders = new Set<ReturnType<typeof createMigrationPackageLoader>>();
    let disposed = false;
    return Object.freeze({
        async verify(
            input: MigrationVerificationExecutionInput,
            signal: AbortSignal,
        ): Promise<readonly MigrationJobResultV1[]> {
            if (disposed) {
                throw new Error("PostgreSQL migration verifier is disposed");
            }
            if (input.migrationInputs.length === 0) {
                return [];
            }
            const targetDigest = await computeIntegrationPackageDigest(input.targetPackage);
            const target = { digest: targetDigest, envelope: input.targetPackage };
            const packageMap = exactMigrationPackageMap(input.migrationPackages);
            await assertExactTransportSet(input.migrationInputs, input.migrationPackages, packageMap);
            assertTargetPackage(input.migrationInputs, targetDigest, input.targetPackage);
            const database = new SQL(input.database.connectionUri, { max: 1 });
            try {
                await assertDisposableMigrationTarget(database, input.database.databaseId);
                const baseline = await establishTrustedBaseline(database);
                const environments = new Map<string, string>();
                for (const migration of input.migrationInputs) {
                    const attestedDigest = await attestTrustedEnvironment(database, migration.environment);
                    environments.set(migration.environment.digest, attestedDigest);
                }
                const results: MigrationJobResultV1[] = [];
                for (const migration of input.migrationInputs) {
                    signal.throwIfAborted();
                    const source = requireExactPackage(packageMap, migration.source);
                    const loader = createMigrationPackageLoader(config);
                    activeLoaders.add(loader);
                    try {
                        const matrices: MatrixMigrationEvidence[] = [];
                        for (const matrix of migration.dependencyMatrices) {
                            const evidence = await executeMigrationMatrix({
                                database,
                                loader,
                                source,
                                target,
                                dependencies: matrix.dependencies.map((entry) =>
                                    requireExactPackage(packageMap, entry),
                                ),
                                migration,
                                attempt: input.attempt,
                                selection: matrix.selection,
                                reset: async () => {
                                    await restoreTrustedBaseline(database, baseline);
                                    await requireAttestedEnvironment(database, migration, environments);
                                },
                                signal,
                            });
                            const { evidenceDigests: _evidenceDigests, ...digestEvidence } = evidence;
                            matrices.push({
                                ...evidence,
                                evidenceDigests: [await matrixEvidenceDigest(digestEvidence)],
                            });
                        }
                        results.push(
                            await inMigrationVerificationPhase("equivalence", async () =>
                                successfulResult(
                                    migration,
                                    input.attempt,
                                    requireEnvironmentDigest(environments, migration.environment.digest),
                                    matrices,
                                ),
                            ),
                        );
                    } catch (error) {
                        if (signal.aborted) {
                            throw signal.reason;
                        }
                        if (error instanceof TypeError || isResetFailure(error)) {
                            throw error;
                        }
                        results.push(
                            await failedResult(
                                migration,
                                input.attempt,
                                requireEnvironmentDigest(environments, migration.environment.digest),
                                error,
                            ),
                        );
                    } finally {
                        await loader.dispose();
                        activeLoaders.delete(loader);
                    }
                }
                await restoreTrustedBaseline(database, baseline);
                for (const migration of input.migrationInputs) {
                    await requireAttestedEnvironment(database, migration, environments);
                }
                return results;
            } finally {
                await database.close().catch(() => undefined);
            }
        },
        async dispose() {
            disposed = true;
            await Promise.all([...activeLoaders].map(async (loader) => await loader.dispose()));
            activeLoaders.clear();
        },
    });
}

function requireEnvironmentDigest(environments: ReadonlyMap<string, string>, expected: string): string {
    const observed = environments.get(expected);
    if (!observed) {
        throw new TypeError("Migration verification environment was not attested");
    }
    return observed;
}

async function requireAttestedEnvironment(
    database: SQL,
    migration: MigrationVerificationInputV1,
    environments: ReadonlyMap<string, string>,
): Promise<void> {
    const expected = requireEnvironmentDigest(environments, migration.environment.digest);
    if ((await attestTrustedEnvironment(database, migration.environment)) !== expected) {
        throw new TypeError("Migration verification environment changed during execution");
    }
}

function assertTargetPackage(
    inputs: readonly MigrationVerificationInputV1[],
    targetDigest: string,
    targetPackage: MigrationVerificationExecutionInput["targetPackage"],
): void {
    if (
        inputs.some(
            (migration) =>
                migration.target.packageDigest !== targetDigest ||
                migration.target.kind !== targetPackage.kind ||
                migration.target.version !== targetPackage.version,
        )
    ) {
        throw new TypeError("Migration proof targets substituted candidate package bytes");
    }
}

async function assertExactTransportSet(
    inputs: readonly MigrationVerificationInputV1[],
    entries: MigrationVerificationExecutionInput["migrationPackages"],
    packages: ReadonlyMap<string, { envelope: { kind: string; version: string } }>,
): Promise<void> {
    const expected = new Map<string, Readonly<{ kind: string; version: string }>>();
    for (const input of inputs) {
        for (const reference of [input.source, ...input.dependencyMatrices.flatMap((matrix) => matrix.dependencies)]) {
            const previous = expected.get(reference.packageDigest);
            if (previous && (previous.kind !== reference.kind || previous.version !== reference.version)) {
                throw new TypeError("One migration package digest is bound to conflicting release identities");
            }
            expected.set(reference.packageDigest, reference);
        }
    }
    const digests = await Promise.all(entries.map((entry) => computeIntegrationPackageDigest(entry.envelope)));
    if (
        entries.some((entry, index) => entry.digest !== digests[index]) ||
        entries.some((entry, index) => index > 0 && entry.digest <= entries[index - 1]!.digest) ||
        expected.size !== packages.size ||
        [...expected].some(
            ([digest, reference]) =>
                packages.get(digest)?.envelope.kind !== reference.kind ||
                packages.get(digest)?.envelope.version !== reference.version,
        )
    ) {
        throw new TypeError("Migration package transport is not the exact required source and dependency set");
    }
}

function isResetFailure(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("Disposable PostgreSQL reset");
}
