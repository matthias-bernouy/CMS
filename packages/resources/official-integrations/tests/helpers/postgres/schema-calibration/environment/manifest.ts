import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";

export const SCHEMA_CALIBRATION_POSTGRES_IMAGE =
    "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";

export const SCHEMA_CALIBRATION_SESSION_SETTINGS = Object.freeze({
    DateStyle: "ISO, MDY",
    IntervalStyle: "postgres",
    TimeZone: "UTC",
    extra_float_digits: "3",
    search_path: "pg_catalog, public",
    standard_conforming_strings: "on",
});

export type SchemaCalibrationEnvironmentIdentity = Readonly<{
    bootstrapSql: string;
    digest: string;
    image: string;
    manifest: Readonly<{
        schema: "cms.integration.schema-calibration-environment.v1";
        image: string;
        session: typeof SCHEMA_CALIBRATION_SESSION_SETTINGS;
        roles: readonly string[];
        extensions: readonly string[];
        fixtures: readonly string[];
    }>;
}>;

export async function schemaCalibrationEnvironmentIdentity(): Promise<SchemaCalibrationEnvironmentIdentity> {
    const bootstrapSql = await readFile(fileURLToPath(new URL("./bootstrap.sql", import.meta.url)), "utf8");
    const bootstrapDigest = await sha256Hex(bootstrapSql);
    const manifest = {
        schema: "cms.integration.schema-calibration-environment.v1" as const,
        image: SCHEMA_CALIBRATION_POSTGRES_IMAGE,
        session: SCHEMA_CALIBRATION_SESSION_SETTINGS,
        roles: ["anon:NOLOGIN", "authenticated:NOLOGIN", "service_role:NOLOGIN:BYPASSRLS"],
        extensions: ["pgcrypto@extensions"],
        fixtures: [`bootstrap.sql@sha256:${bootstrapDigest}`, "storage.buckets-shim.v1"],
    };
    return {
        bootstrapSql,
        digest: await sha256Hex(canonicalJsonBytes(manifest)),
        image: SCHEMA_CALIBRATION_POSTGRES_IMAGE,
        manifest,
    };
}
