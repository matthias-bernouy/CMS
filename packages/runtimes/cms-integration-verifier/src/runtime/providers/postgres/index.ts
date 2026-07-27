import { SQL } from "bun";
import { randomBytes } from "node:crypto";
import type { DisposableVerificationDatabaseLease, DisposableVerificationDatabaseProvider } from "../../../supervisor";
import { adminUri, databaseUri, postgresIdentifier as identifier, readPostgresProviderConfig } from "./configuration";
import {
    assertDedicatedPostgresCluster,
    assertPostgresServerFingerprint,
    readPostgresServerFingerprint,
} from "./fingerprint";
import { assertSharedRoles, bootstrapDatabase, ensureSharedRoles } from "./lifecycle";
import { withPostgresProviderMutationLock } from "./mutex";
import {
    assertDisposablePostgresRoleSettings,
    bindPostgresOwnedDatabase,
    createPostgresOwnershipHeartbeat,
    createPostgresOwnedRole,
    markPostgresOwnershipReady,
    reservePostgresOwnership,
    type PostgresOwnershipHeartbeat,
} from "./ownership";
import { assertPostgresOwnershipStore, ensurePostgresOwnershipStore } from "./ownership/store";
import {
    assertDisposablePostgresOwnershipInventory,
    POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
    recoverDisposablePostgresObjects,
    releaseDisposablePostgresObjects,
} from "./recovery";
import { assertDisposablePostgresSessionSettings } from "./security";

export const createDisposableVerificationDatabaseProvider = (): Promise<DisposableVerificationDatabaseProvider> =>
    createDisposableVerificationDatabaseProviderFromEnv(process.env);

export async function createDisposableVerificationDatabaseProviderFromEnv(
    source: Record<string, string | undefined>,
): Promise<DisposableVerificationDatabaseProvider> {
    const config = await readPostgresProviderConfig(source);
    const admin = new SQL(adminUri(config), { max: 2 });
    const instanceId = randomBytes(16).toString("hex");
    const heartbeats = new Set<PostgresOwnershipHeartbeat>();
    let serverFingerprint = "";
    let refresh: Promise<void> | null = null;

    const initializeCluster = async (): Promise<void> => {
        if (refresh) {
            return await refresh;
        }
        refresh = (async () => {
            const observed = await readPostgresServerFingerprint(admin);
            await assertDedicatedPostgresCluster(admin, config.database);
            if (serverFingerprint === observed) {
                return;
            }
            if (serverFingerprint && serverFingerprint !== observed) {
                for (const heartbeat of heartbeats) {
                    heartbeat.invalidate(new Error("Disposable PostgreSQL cluster restarted during an active lease"));
                }
                heartbeats.clear();
            }
            await withPostgresProviderMutationLock(admin, async (locked) => {
                const lockedFingerprint = await readPostgresServerFingerprint(locked);
                await assertDedicatedPostgresCluster(locked, config.database);
                await ensureSharedRoles(locked);
                await ensurePostgresOwnershipStore(locked);
                await recoverDisposablePostgresObjects(locked, {
                    confirmation: POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
                    serverFingerprint: lockedFingerprint,
                });
                serverFingerprint = lockedFingerprint;
            });
        })();
        try {
            await refresh;
        } finally {
            refresh = null;
        }
    };

    try {
        await initializeCluster();
    } catch (error) {
        await admin.close().catch(() => undefined);
        throw error;
    }

    const probe = async (signal: AbortSignal) => {
        signal.throwIfAborted();
        await initializeCluster();
        await assertPostgresServerFingerprint(admin, serverFingerprint);
        await assertDedicatedPostgresCluster(admin, config.database);
        await assertSharedRoles(admin);
        await assertPostgresOwnershipStore(admin);
        await assertDisposablePostgresOwnershipInventory(admin, serverFingerprint, config);
        for (const heartbeat of heartbeats) {
            heartbeat.assertHealthy();
        }
        signal.throwIfAborted();
    };

    return Object.freeze({
        probe,
        async acquire(
            identity: Readonly<{ candidateId: string; packageDigest: string; verificationDigest: string }>,
            signal: AbortSignal,
        ): Promise<DisposableVerificationDatabaseLease> {
            await probe(signal);
            const suffix = randomBytes(12).toString("hex");
            const role = `cmsv_${suffix}`;
            const database = `cmscore_contracts_${suffix}`;
            const password = randomBytes(32).toString("base64url");
            const prepared = await withPostgresProviderMutationLock(admin, async (locked) => {
                await assertDedicatedPostgresCluster(locked, config.database);
                await recoverDisposablePostgresObjects(locked, {
                    confirmation: POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
                    serverFingerprint,
                });
                let marker = await reservePostgresOwnership(locked, {
                    database,
                    role,
                    serverFingerprint,
                    instanceId,
                    leaseDurationMs: config.leaseDurationMs,
                    job: identity,
                });
                const heartbeat = createPostgresOwnershipHeartbeat(admin, marker, config, heartbeats);
                try {
                    marker = await createPostgresOwnedRole(locked, marker, password, config);
                    heartbeat.assertHealthy();
                    signal.throwIfAborted();
                    await locked.unsafe(`create database ${identifier(database)} template template0 encoding 'UTF8'`);
                    marker = await bindPostgresOwnedDatabase(locked, marker);
                    heartbeat.assertHealthy();
                    await bootstrapDatabase(config, database, role);
                    await assertDisposablePostgresRoleSettings(locked, marker, config);
                    const credential = Object.freeze({
                        databaseId: database,
                        connectionUri: databaseUri(config, database, role, password),
                    });
                    const sandbox = new SQL(credential.connectionUri, { max: 1 });
                    try {
                        await assertDisposablePostgresSessionSettings(sandbox, config);
                    } finally {
                        await sandbox.close().catch(() => undefined);
                    }
                    signal.throwIfAborted();
                    marker = await markPostgresOwnershipReady(locked, marker);
                    heartbeat.assertHealthy();
                    return { credential, marker, heartbeat };
                } catch (error) {
                    heartbeat.stop();
                    await releaseDisposablePostgresObjects(
                        locked,
                        marker,
                        POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
                    ).catch(() => undefined);
                    throw error;
                }
            });
            let released = false;
            return Object.freeze({
                credential: prepared.credential,
                async release() {
                    if (released) {
                        return;
                    }
                    prepared.heartbeat.stop();
                    await initializeCluster();
                    await withPostgresProviderMutationLock(admin, async (locked) => {
                        await assertDedicatedPostgresCluster(locked, config.database);
                        await releaseDisposablePostgresObjects(
                            locked,
                            prepared.marker,
                            POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
                        );
                    });
                    released = true;
                },
            });
        },
    });
}
