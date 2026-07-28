import { describe, expect, test } from "bun:test";
import { readRuntimeEnv } from "../../../src/runtimeEnv";

const validEnv = () => ({
    CONTROL_PUBLIC_URL: "https://admin.example.com",
    DELIVERY_PUBLIC_URL: "https://www.example.com",
    CMS_SESSION_SECRET: "session-secret",
    CMS_KEK_HEX: "00".repeat(32),
    CMS_ADMIN_EMAIL: "admin@example.com",
    CMS_ADMIN_PASSWORD: "password",
    CMS_FILES_DIR: "/data/files",
    CMS_INTEGRATION_PACKAGE_CACHE_DIR: "/data/integration-packages",
    MONGO_URL: "mongodb://mongo:27017/cms",
    ANALYTICS_SALT_SECRET: "analytics-secret",
    P9R_INTEGRATION_REPOSITORY_URL: "https://repository.example.com/.cms/repository",
});

describe("repository management CMS gateway configuration", () => {
    test("is absent on ordinary CMS instances", () => {
        expect(readRuntimeEnv(validEnv()).repositoryManagementGateway).toBeUndefined();
    });

    test("requires an explicit complete upstream configuration", () => {
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_REPOSITORY_MANAGEMENT_GATEWAY_ENABLED: "true",
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL: "http://cms-repository:3000/.cms/repository-management/",
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TOKEN_FILE: "/run/secrets/repository-management-upstream-token",
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TIMEOUT_MS: "90000",
            }).repositoryManagementGateway,
        ).toEqual({
            url: "http://cms-repository:3000/.cms/repository-management",
            tokenFile: "/run/secrets/repository-management-upstream-token",
            timeoutMs: 90_000,
        });

        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_REPOSITORY_MANAGEMENT_GATEWAY_ENABLED: "true",
            }),
        ).toThrow(/CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL missing/);
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL: "http://repository/.cms/repository-management",
            }),
        ).toThrow(/require CMS_REPOSITORY_MANAGEMENT_GATEWAY_ENABLED=true/);
    });

    test("rejects unsafe upstream coordinates", () => {
        const enabled = {
            ...validEnv(),
            CMS_REPOSITORY_MANAGEMENT_GATEWAY_ENABLED: "true",
            CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TOKEN_FILE: "/run/secrets/token",
        };
        expect(() =>
            readRuntimeEnv({
                ...enabled,
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL: "https://user:secret@repository/.cms/repository-management",
            }),
        ).toThrow(/must not contain credentials/);
        expect(() =>
            readRuntimeEnv({
                ...enabled,
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL: "https://repository/.cms/repository",
            }),
        ).toThrow(/must end at \/.cms\/repository-management/);
        expect(() =>
            readRuntimeEnv({
                ...enabled,
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL: "https://repository/.cms/repository-management",
                CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TOKEN_FILE: "relative-token",
            }),
        ).toThrow(/must be an absolute path/);
    });
});
