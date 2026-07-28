import { describe, expect, test } from "bun:test";
import {
    POSTGRES_CONTRACT_RESET_CONFIRMATION,
    requireDisposablePostgresContractTarget,
} from "../../../../../helpers/postgres/postgresContractTarget";

describe("PostgreSQL contract destructive target guard", () => {
    test.each([
        "postgres://postgres:secret@127.0.0.1:5432/cmscore_contracts",
        "postgresql://postgres:secret@localhost/cmscore_contracts_media",
    ])("accepts an explicitly confirmed loopback disposable database %s", (databaseUrl) => {
        expect(
            requireDisposablePostgresContractTarget({
                ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET: POSTGRES_CONTRACT_RESET_CONFIRMATION,
                DATABASE_URL: databaseUrl,
            }),
        ).toBe(databaseUrl);
    });

    test.each([
        ["missing confirmation", undefined, "postgres://postgres@127.0.0.1/cmscore_contracts"],
        ["wrong confirmation", "true", "postgres://postgres@127.0.0.1/cmscore_contracts"],
        [
            "remote host",
            POSTGRES_CONTRACT_RESET_CONFIRMATION,
            "postgres://postgres@db.production.test/cmscore_contracts",
        ],
        ["unmarked database", POSTGRES_CONTRACT_RESET_CONFIRMATION, "postgres://postgres@127.0.0.1/commerce"],
        ["wrong protocol", POSTGRES_CONTRACT_RESET_CONFIRMATION, "https://postgres@127.0.0.1/cmscore_contracts"],
    ])("rejects %s", (_label, confirmation, databaseUrl) => {
        expect(() =>
            requireDisposablePostgresContractTarget({
                ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET: confirmation,
                DATABASE_URL: databaseUrl,
            }),
        ).toThrow();
    });
});
