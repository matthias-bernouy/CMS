import { describe, expect, test } from "bun:test";
import {
    parseRepositoryBaselineImportConfig,
    parseRepositoryVerificationBackfillConfig,
} from "../../../src/repositoryPublication/baselineImportConfig";

const COMMAND = "import-official-schema-baselines";

describe("official schema baseline import configuration", () => {
    test("allows a credential-free dry run", () => {
        expect(parseRepositoryBaselineImportConfig([COMMAND, "--dry-run"], {})).toEqual({
            dryRun: true,
            timeoutMs: 60_000,
        });
    });

    test("normalizes the separate maintenance configuration", () => {
        expect(
            parseRepositoryBaselineImportConfig([COMMAND], {
                P9R_INTEGRATION_REPOSITORY_MAINTENANCE_URL:
                    " HTTPS://Repository.Internal:443/.cms/repository-management/// ",
                P9R_INTEGRATION_REPOSITORY_MAINTENANCE_TOKEN_FILE: "/run/secrets/../secrets/maintenance-token",
                P9R_INTEGRATION_REPOSITORY_MAINTENANCE_TIMEOUT_MS: "90000",
            }),
        ).toEqual({
            dryRun: false,
            maintenanceUrl: "https://repository.internal/.cms/repository-management",
            tokenFile: "/run/secrets/maintenance-token",
            timeoutMs: 90_000,
        });
    });

    test("requires maintenance URL and token outside dry-run mode", () => {
        expect(() =>
            parseRepositoryBaselineImportConfig([COMMAND], {
                P9R_INTEGRATION_REPOSITORY_MAINTENANCE_URL: "https://repository.internal/management",
            }),
        ).toThrow("maintenance URL and token file");
        expect(() =>
            parseRepositoryBaselineImportConfig([COMMAND], {
                P9R_INTEGRATION_REPOSITORY_MAINTENANCE_TOKEN_FILE: "/run/secrets/token",
            }),
        ).toThrow("maintenance URL and token file");
    });

    test("rejects unsafe locations, duplicate flags, and unbounded timeouts", () => {
        expect(() => parseRepositoryBaselineImportConfig([COMMAND, "--dry-run", "--dry-run"], {})).toThrow(
            "duplicated",
        );
        expect(() =>
            parseRepositoryBaselineImportConfig(
                [COMMAND, "--url=https://user:secret@repository/management", "--token-file=/run/secrets/token"],
                {},
            ),
        ).toThrow("must not contain credentials");
        expect(() =>
            parseRepositoryBaselineImportConfig(
                [COMMAND, "--url=https://repository/management", "--token-file=relative"],
                {},
            ),
        ).toThrow("absolute path");
        for (const timeout of ["0", "120001", "1.5", "forever"]) {
            expect(() =>
                parseRepositoryBaselineImportConfig(
                    [
                        COMMAND,
                        "--url=https://repository/management",
                        "--token-file=/run/secrets/token",
                        `--timeout-ms=${timeout}`,
                    ],
                    {},
                ),
            ).toThrow("between 1 and 120000");
        }
    });
});

describe("official verification backfill configuration", () => {
    test("uses the same isolated maintenance configuration", () => {
        expect(parseRepositoryVerificationBackfillConfig(["backfill-official-verification", "--dry-run"], {})).toEqual({
            dryRun: true,
            timeoutMs: 60_000,
        });
        expect(() => parseRepositoryVerificationBackfillConfig(["backfill-official-verification"], {})).toThrow(
            "Verification backfill requires a maintenance URL and token file",
        );
        expect(() => parseRepositoryVerificationBackfillConfig([COMMAND, "--dry-run"], {})).toThrow(
            "backfill-official-verification",
        );
    });
});
