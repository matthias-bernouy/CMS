import { describe, expect, test } from "bun:test";
import { schemaCalibrationEnvironmentIdentity } from "./manifest";

describe("schema calibration environment identity", () => {
    test("covers the pinned image, bootstrap SQL, roles, extension, fixture, and session", async () => {
        const first = await schemaCalibrationEnvironmentIdentity();
        const second = await schemaCalibrationEnvironmentIdentity();

        expect(first).toEqual(second);
        expect(first.image).toContain("postgres:16-alpine@sha256:");
        expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
        expect(first.bootstrapSql).toContain("create role service_role nologin bypassrls");
        expect(first.bootstrapSql).toContain("create table if not exists storage.buckets");
        expect(first.manifest.session.TimeZone).toBe("UTC");
        expect(first.manifest.extensions).toEqual(["pgcrypto@extensions"]);
    });
});
