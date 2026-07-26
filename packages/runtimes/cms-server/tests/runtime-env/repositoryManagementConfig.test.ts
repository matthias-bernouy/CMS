import { describe, expect, test } from "bun:test";
import { parseRepositoryManagementGatewayConfig } from "../../src/repositoryManagement/config";
import { readRuntimeEnv } from "../../src/runtimeEnv";

const MANAGEMENT_URL = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL";
const MANAGEMENT_TOKEN_FILE = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE";
const MANAGEMENT_ADMIN = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ADMIN_SUBJECT_IDENTIFIER";
const MANAGEMENT_TIMEOUT = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS";

describe("repository management gateway environment", () => {
    test("keeps the capability disabled when every setting is absent", () => {
        expect(parseRepositoryManagementGatewayConfig({})).toBeUndefined();
        expect(readRuntimeEnv(validRuntimeEnv()).repositoryManagement).toBeUndefined();
    });

    test("returns one normalized all-or-none runtime configuration", () => {
        const env = readRuntimeEnv({
            ...validRuntimeEnv(),
            [MANAGEMENT_URL]: " HTTPS://Repository.Internal:443/.cms/repository-management/// ",
            [MANAGEMENT_TOKEN_FILE]: "/run/secrets/../secrets/repository-token",
            [MANAGEMENT_ADMIN]: " local:repository-owner ",
        });

        expect(env.repositoryManagement).toEqual({
            url: "https://repository.internal/.cms/repository-management",
            tokenFile: "/run/secrets/repository-token",
            administratorSubjectIdentifier: "local:repository-owner",
            timeoutMs: 60_000,
        });
        expect(Object.isFrozen(env.repositoryManagement)).toBe(true);
    });

    test("refuses every partial configuration, including timeout alone", () => {
        const complete: Record<string, string> = {
            [MANAGEMENT_URL]: "http://repository:3000/.cms/repository-management",
            [MANAGEMENT_TOKEN_FILE]: "/run/secrets/repository-token",
            [MANAGEMENT_ADMIN]: "administrator-subject",
            [MANAGEMENT_TIMEOUT]: "90000",
        };
        for (const missing of [MANAGEMENT_URL, MANAGEMENT_TOKEN_FILE, MANAGEMENT_ADMIN]) {
            const partial = { ...complete };
            delete partial[missing];
            expect(() => parseRepositoryManagementGatewayConfig(partial)).toThrow(
                `Repository management requires non-empty ${missing}`,
            );
        }

        expect(() => parseRepositoryManagementGatewayConfig({ [MANAGEMENT_TIMEOUT]: "1000" })).toThrow(
            `Repository management requires non-empty ${MANAGEMENT_URL}`,
        );
        expect(() =>
            parseRepositoryManagementGatewayConfig({
                ...complete,
                [MANAGEMENT_ADMIN]: " ",
            }),
        ).toThrow(`Repository management requires non-empty ${MANAGEMENT_ADMIN}`);
    });

    test("accepts only normalized absolute HTTP(S) URLs without ambient request data", () => {
        expect(
            parseRepositoryManagementGatewayConfig({
                ...completeManagementEnv(),
                [MANAGEMENT_URL]: "http://repository:3000/management/",
            }),
        ).toMatchObject({ url: "http://repository:3000/management" });

        for (const url of [
            "repository:3000/management",
            "ftp://repository/management",
            "https://user:secret@repository/management",
            "https://repository/management?operation=publish",
            "https://repository/management#private",
        ]) {
            expect(() =>
                parseRepositoryManagementGatewayConfig({
                    ...completeManagementEnv(),
                    [MANAGEMENT_URL]: url,
                }),
            ).toThrow(MANAGEMENT_URL);
        }
    });

    test("requires an absolute token path and bounds the request timeout", () => {
        expect(() =>
            parseRepositoryManagementGatewayConfig({
                ...completeManagementEnv(),
                [MANAGEMENT_TOKEN_FILE]: "repository-token",
            }),
        ).toThrow(`${MANAGEMENT_TOKEN_FILE} must be an absolute path`);

        expect(
            parseRepositoryManagementGatewayConfig({
                ...completeManagementEnv(),
                [MANAGEMENT_TIMEOUT]: "120000",
            }),
        ).toMatchObject({ timeoutMs: 120_000 });
        for (const timeout of ["0", "120001", "1.5", "unbounded"]) {
            expect(() =>
                parseRepositoryManagementGatewayConfig({
                    ...completeManagementEnv(),
                    [MANAGEMENT_TIMEOUT]: timeout,
                }),
            ).toThrow(`${MANAGEMENT_TIMEOUT} must be an integer between 1 and 120000`);
        }
    });
});

function completeManagementEnv(): Record<string, string> {
    return {
        [MANAGEMENT_URL]: "http://repository:3000/.cms/repository-management",
        [MANAGEMENT_TOKEN_FILE]: "/run/secrets/repository-token",
        [MANAGEMENT_ADMIN]: "administrator-subject",
    };
}

function validRuntimeEnv() {
    return {
        CONTROL_PUBLIC_URL: "https://admin.example.com",
        DELIVERY_PUBLIC_URL: "https://www.example.com",
        CMS_SESSION_SECRET: "session-secret",
        CMS_KEK_HEX: "00".repeat(32),
        CMS_ADMIN_EMAIL: "admin@example.com",
        CMS_ADMIN_PASSWORD: "password",
        CMS_FILES_DIR: "/data/files",
        CMS_INTEGRATION_PACKAGE_CACHE_DIR: "/data/integration-packages",
        MONGO_URL: "mongodb://mongo:27017/cms",
        ANALYTICS_SALT_SECRET: "shared-analytics-secret",
    };
}
