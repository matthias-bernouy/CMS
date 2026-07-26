import { SQL } from "bun";
import { randomBytes } from "node:crypto";
import type { DisposableVerificationDatabaseLease, DisposableVerificationDatabaseProvider } from "../../../supervisor";
import {
    adminUri,
    databaseUri,
    postgresIdentifier as identifier,
    postgresLiteral as literal,
    readPostgresProviderConfig,
} from "./configuration";
import { bootstrapDatabase, cleanupDatabase, ensureSharedRoles } from "./lifecycle";
import { recoverDisposablePostgresObjects } from "./recovery";

export async function createDisposableVerificationDatabaseProvider(): Promise<DisposableVerificationDatabaseProvider> {
    return await createDisposableVerificationDatabaseProviderFromEnv(process.env);
}

export async function createDisposableVerificationDatabaseProviderFromEnv(
    source: Record<string, string | undefined>,
): Promise<DisposableVerificationDatabaseProvider> {
    const config = await readPostgresProviderConfig(source);
    const admin = new SQL(adminUri(config), { max: 1 });
    await ensureSharedRoles(admin);
    await recoverDisposablePostgresObjects(admin);
    return Object.freeze({
        async acquire(
            _identity: Readonly<{ candidateId: string; packageDigest: string; verificationDigest: string }>,
            signal: AbortSignal,
        ): Promise<DisposableVerificationDatabaseLease> {
            if (signal.aborted) {
                throw signal.reason;
            }
            const suffix = randomBytes(12).toString("hex");
            const role = `cmsv_${suffix}`;
            const database = `cmscore_contracts_${suffix}`;
            const password = randomBytes(32).toString("base64url");
            let createdRole = false;
            let createdDatabase = false;
            try {
                await admin.unsafe(
                    `create role ${identifier(role)} login password ${literal(password)} nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 4`,
                );
                createdRole = true;
                await admin.unsafe(
                    `alter role ${identifier(role)} set statement_timeout = ${literal(`${config.statementTimeoutMs}ms`)}`,
                );
                await admin.unsafe(`alter role ${identifier(role)} set lock_timeout = '10s'`);
                await admin.unsafe(`alter role ${identifier(role)} set idle_in_transaction_session_timeout = '30s'`);
                await admin.unsafe(`create database ${identifier(database)} template template0 encoding 'UTF8'`);
                createdDatabase = true;
                await admin.unsafe(`revoke all on database ${identifier(database)} from public`);
                await admin.unsafe(
                    `grant connect, create, temporary on database ${identifier(database)} to ${identifier(role)}`,
                );
                await bootstrapDatabase(config, database, role);
                if (signal.aborted) {
                    throw signal.reason;
                }
            } catch (error) {
                await cleanupDatabase(admin, role, database, createdDatabase, createdRole).catch(() => undefined);
                throw error;
            }
            let released = false;
            return Object.freeze({
                credential: Object.freeze({
                    databaseId: database,
                    connectionUri: databaseUri(config, database, role, password),
                }),
                async release() {
                    if (released) {
                        return;
                    }
                    released = true;
                    await cleanupDatabase(admin, role, database, true, true);
                },
            });
        },
    });
}
