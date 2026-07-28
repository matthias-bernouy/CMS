import { describe, expect, test } from "bun:test";
import { DisposableSchemaCalibrationCluster } from "./database";

describe("disposable schema calibration database guard", () => {
    test("reuses the existing explicit loopback and database-prefix guard", () => {
        expect(
            () =>
                new DisposableSchemaCalibrationCluster({
                    ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET: "cmscore-postgres-contracts",
                    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/cmscore_contracts",
                }),
        ).not.toThrow();
        expect(
            () =>
                new DisposableSchemaCalibrationCluster({
                    ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET: "cmscore-postgres-contracts",
                    DATABASE_URL: "postgres://postgres:postgres@database.example/cmscore_contracts",
                }),
        ).toThrow(/loopback/);
    });
});
