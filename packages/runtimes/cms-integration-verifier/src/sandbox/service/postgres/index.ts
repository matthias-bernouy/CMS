import { SQL } from "bun";
import type { PostgresPlatformVerificationAdapter } from "../../postgres";
import { createSqlPackageLoader, applyPackageSql, observeConnectorSchemas } from "./application";
import {
    readBoundarySnapshot,
    readGrantObservation,
    readRlsObservation,
    readRoleMembershipObservation,
    readRoutineObservation,
    readUnknownSurfaceObservation,
    readViewObservation,
} from "./catalog";
import { buildPlatformEvidence } from "./checks";
import { proveBehavioralRlsIsolation } from "./checks/behavioral";
import { createPostgresAuthorSuiteVerifier } from "./suites/author";
import { executeExactDependencyMatrices } from "./suites/dependencies";
import { createPostgresMigrationVerifier } from "./migrations";

const POSTGRES_IMAGE = "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";

export type PostgresPlatformVerificationAdapterConfig = Readonly<{
    packageTempRoot?: string;
    maxCachedPackages?: number;
}>;

export function createPostgresPlatformVerificationAdapter(
    config: PostgresPlatformVerificationAdapterConfig = {},
): PostgresPlatformVerificationAdapter {
    const packages = createSqlPackageLoader(config);
    const migrations = createPostgresMigrationVerifier(config);
    const author = createPostgresAuthorSuiteVerifier({ tempRoot: config.packageTempRoot ?? process.cwd() });
    return Object.freeze({
        async environmentVersions(signal: AbortSignal) {
            signal.throwIfAborted();
            return [
                { name: "bun", version: Bun.version },
                { name: "author-suite-runtime", version: "bun-vm-ipc-v1" },
                { name: "postgres-image", version: POSTGRES_IMAGE },
                { name: "platform-policy", version: "postgres-platform-v1.4.0" },
            ];
        },
        async verifyPackage(
            input: Parameters<PostgresPlatformVerificationAdapter["verifyPackage"]>[0],
            signal: AbortSignal,
        ) {
            const {
                package: envelope,
                dependencies = [],
                dependencyPackages = [],
                behavioralRlsPlan,
                database,
                platformSuites,
            } = input;
            const started = performance.now();
            const loaded = await packages.load(envelope);
            const sql = new SQL(database.connectionUri, { max: 1 });
            try {
                const dependencyExecutions = await executeExactDependencyMatrices(
                    {
                        database: sql,
                        databaseId: database.databaseId,
                        candidate: envelope,
                        packages: dependencyPackages,
                        ...(config.packageTempRoot ? { packageTempRoot: config.packageTempRoot } : {}),
                        ...(config.maxCachedPackages ? { maxCachedPackages: config.maxCachedPackages } : {}),
                    },
                    signal,
                );
                if (loaded.connectors.length === 0) {
                    return {
                        durationMs: elapsed(started),
                        suites: await buildPlatformEvidence(
                            platformSuites,
                            loaded,
                            dependencies,
                            undefined,
                            dependencyExecutions,
                        ),
                    };
                }
                const ownedNamespaces = unique(loaded.connectors.flatMap((connector) => connector.ownedNamespaces));
                const dataApiSchemas = unique(loaded.connectors.flatMap((connector) => connector.dataApiSchemas));
                const before = await readBoundarySnapshot(sql, ownedNamespaces);
                try {
                    await applyPackageSql(sql, loaded, signal);
                    const installedSchemas = await observeConnectorSchemas(sql, loaded.connectors);
                    const afterInstall = await readBoundarySnapshot(sql, ownedNamespaces);
                    await applyPackageSql(sql, loaded, signal);
                    const reappliedSchemas = await observeConnectorSchemas(sql, loaded.connectors);
                    const afterReapply = await readBoundarySnapshot(sql, ownedNamespaces);
                    const rls = await readRlsObservation(sql, dataApiSchemas);
                    const grants = await readGrantObservation(sql, dataApiSchemas);
                    const memberships = await readRoleMembershipObservation(sql);
                    const unknownSurfaces = await readUnknownSurfaceObservation(sql, dataApiSchemas);
                    const views = await readViewObservation(sql, dataApiSchemas);
                    const routines = await readRoutineObservation(sql, ownedNamespaces);
                    const behavioralRls = behavioralRlsPlan
                        ? await proveBehavioralRlsIsolation(
                              sql,
                              behavioralRlsPlan,
                              rls.relations
                                  .filter((relation) => relation.exposedRoles.length > 0)
                                  .map(({ namespace, relation }) => ({ namespace, relation })),
                              signal,
                          )
                        : undefined;
                    return {
                        durationMs: elapsed(started),
                        suites: await buildPlatformEvidence(
                            platformSuites,
                            loaded,
                            dependencies,
                            {
                                loaded,
                                before,
                                afterInstall,
                                afterReapply,
                                installedSchemas,
                                reappliedSchemas,
                                rls,
                                grants,
                                memberships,
                                unknownSurfaces,
                                views,
                                routines,
                                behavioralRls,
                            },
                            dependencyExecutions,
                        ),
                    };
                } catch (error) {
                    if (signal.aborted) {
                        throw signal.reason;
                    }
                    if (infrastructureFailure(error)) {
                        throw error;
                    }
                    return {
                        durationMs: elapsed(started),
                        suites: await buildPlatformEvidence(
                            platformSuites,
                            loaded,
                            dependencies,
                            undefined,
                            dependencyExecutions,
                        ),
                    };
                }
            } finally {
                await sql.close();
            }
        },
        async verifyMigrations(
            input: Parameters<NonNullable<PostgresPlatformVerificationAdapter["verifyMigrations"]>>[0],
            signal: AbortSignal,
        ) {
            return await migrations.verify(
                {
                    targetPackage: input.package,
                    migrationPackages: input.migrationPackages,
                    migrationInputs: input.migrationInputs,
                    attempt: input.attempt,
                    database: input.database,
                },
                signal,
            );
        },
        async verifyAuthorSuites(
            input: Parameters<NonNullable<PostgresPlatformVerificationAdapter["verifyAuthorSuites"]>>[0],
            signal: AbortSignal,
        ) {
            return await author.verify(input.suites, input.database.connectionUri, signal);
        },
        async dispose() {
            await Promise.all([packages.dispose(), migrations.dispose()]);
        },
    });
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)].toSorted();
}

function elapsed(started: number): number {
    return Math.max(0, Math.round(performance.now() - started));
}

function infrastructureFailure(error: unknown): boolean {
    const code = (error as { code?: unknown })?.code;
    return (
        typeof code === "string" &&
        (/^08/u.test(code) ||
            [
                "53300",
                "57P01",
                "57P02",
                "57P03",
                "ECONNREFUSED",
                "ECONNRESET",
                "EHOSTUNREACH",
                "ENETUNREACH",
                "EPIPE",
                "ETIMEDOUT",
            ].includes(code))
    );
}
