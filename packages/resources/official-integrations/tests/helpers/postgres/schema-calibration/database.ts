import { SQL } from "bun";
import { requireDisposablePostgresContractTarget } from "../postgresContractTarget";
import { SCHEMA_CALIBRATION_SESSION_SETTINGS, type SchemaCalibrationEnvironmentIdentity } from "./environment/manifest";

const DATABASE_NAME = /^cmscore_contracts_[a-z0-9][a-z0-9_]{0,48}$/;

export type SchemaCalibrationDatabase = Readonly<{
    name: string;
    sql: SQL;
    url: string;
}>;

export class DisposableSchemaCalibrationCluster {
    readonly #admin: SQL;
    readonly #baseUrl: string;
    readonly #databases = new Map<string, SchemaCalibrationDatabase>();

    constructor(source: Record<string, string | undefined>) {
        this.#baseUrl = requireDisposablePostgresContractTarget(source);
        this.#admin = new SQL(this.#baseUrl, { max: 1 });
    }

    async create(name: string, environment: SchemaCalibrationEnvironmentIdentity): Promise<SchemaCalibrationDatabase> {
        assertDatabaseName(name);
        if (this.#databases.has(name)) {
            throw new Error(`Disposable schema calibration database already exists in this run: ${name}`);
        }
        await this.#admin.unsafe(`create database ${quoteIdentifier(name)} template template0 encoding 'UTF8'`);
        const url = databaseUrl(this.#baseUrl, name);
        const sql = new SQL(url, { max: 1 });
        const database = Object.freeze({ name, sql, url });
        this.#databases.set(name, database);
        try {
            await configureDatabase(sql, environment);
            return database;
        } catch (error) {
            await sql.close();
            this.#databases.delete(name);
            await this.#drop(name);
            throw error;
        }
    }

    async drop(database: SchemaCalibrationDatabase): Promise<void> {
        const owned = this.#databases.get(database.name);
        if (owned !== database) {
            throw new Error(`Disposable schema calibration database is not owned by this run: ${database.name}`);
        }
        await database.sql.close();
        await this.#drop(database.name);
        this.#databases.delete(database.name);
    }

    async close(): Promise<void> {
        const databases = [...this.#databases.values()].reverse();
        let firstError: unknown;
        try {
            for (const database of databases) {
                try {
                    await database.sql.close();
                    await this.#drop(database.name);
                    this.#databases.delete(database.name);
                } catch (error) {
                    firstError ??= error;
                }
            }
        } finally {
            await this.#admin.close();
        }
        if (firstError) {
            throw firstError;
        }
    }

    async #drop(name: string): Promise<void> {
        assertDatabaseName(name);
        await this.#admin.unsafe(`drop database if exists ${quoteIdentifier(name)} with (force)`);
    }
}

async function configureDatabase(sql: SQL, environment: SchemaCalibrationEnvironmentIdentity): Promise<void> {
    await sql.unsafe(`set search_path to ${SCHEMA_CALIBRATION_SESSION_SETTINGS.search_path}`);
    await sql.unsafe(`set time zone '${SCHEMA_CALIBRATION_SESSION_SETTINGS.TimeZone}'`);
    await sql.unsafe(`set datestyle to '${SCHEMA_CALIBRATION_SESSION_SETTINGS.DateStyle}'`);
    await sql.unsafe(`set intervalstyle to '${SCHEMA_CALIBRATION_SESSION_SETTINGS.IntervalStyle}'`);
    await sql.unsafe(`set extra_float_digits to ${SCHEMA_CALIBRATION_SESSION_SETTINGS.extra_float_digits}`);
    await sql.unsafe(
        `set standard_conforming_strings to ${SCHEMA_CALIBRATION_SESSION_SETTINGS.standard_conforming_strings}`,
    );
    await sql.unsafe(environment.bootstrapSql);
}

function databaseUrl(baseUrl: string, name: string): string {
    assertDatabaseName(name);
    const parsed = new URL(baseUrl);
    parsed.pathname = `/${name}`;
    return parsed.toString();
}

function quoteIdentifier(value: string): string {
    assertDatabaseName(value);
    return `"${value}"`;
}

function assertDatabaseName(value: string): void {
    if (!DATABASE_NAME.test(value)) {
        throw new Error(`Unsafe disposable schema calibration database name: ${value}`);
    }
}
