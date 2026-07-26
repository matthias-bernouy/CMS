import { describe, expect, test } from "bun:test";
import { parseRepositoryPublicationConfig } from "../../src/repositoryPublication/config";

describe("official repository publication configuration", () => {
    test("allows a credential-free dry run", () => {
        expect(parseRepositoryPublicationConfig(["publish-official", "--dry-run"], {})).toEqual({
            dryRun: true,
            timeoutMs: 60_000,
        });
    });

    test("normalizes a complete environment-backed publication configuration", () => {
        expect(
            parseRepositoryPublicationConfig(["publish-official"], {
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL:
                    " HTTPS://Repository.Internal:443/.cms/repository-management/// ",
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE: "/run/secrets/../secrets/repository-token",
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS: "90000",
            }),
        ).toEqual({
            dryRun: false,
            managementUrl: "https://repository.internal/.cms/repository-management",
            tokenFile: "/run/secrets/repository-token",
            timeoutMs: 90_000,
        });
    });

    test("requires URL and token-file together outside dry-run mode", () => {
        expect(() =>
            parseRepositoryPublicationConfig(["publish-official"], {
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL: "https://repository.internal/management",
            }),
        ).toThrow("requires a management URL and token file");
        expect(() =>
            parseRepositoryPublicationConfig(["publish-official"], {
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE: "/run/secrets/token",
            }),
        ).toThrow("requires a management URL and token file");
    });

    test("rejects duplicated and unknown flags without interpreting their values", () => {
        expect(() => parseRepositoryPublicationConfig(["publish-official", "--dry-run", "--dry-run"], {})).toThrow(
            "duplicated",
        );
        expect(() => parseRepositoryPublicationConfig(["publish-official", "--secret=do-not-parse"], {})).toThrow(
            "Unknown repository publication flag",
        );
    });

    test("rejects ambient URL data, relative secrets, and unbounded timeouts", () => {
        const base = ["publish-official", "--token-file=/run/secrets/token"];
        for (const url of [
            "ftp://repository/management",
            "https://user:secret@repository/management",
            "https://repository/management?operation=publish",
            "https://repository/management#internal",
        ]) {
            expect(() => parseRepositoryPublicationConfig([...base, `--url=${url}`], {})).toThrow();
        }
        expect(() =>
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=https://repository/management", "--token-file=relative"],
                {},
            ),
        ).toThrow("absolute path");
        for (const timeout of ["0", "120001", "1.5", "forever"]) {
            expect(() =>
                parseRepositoryPublicationConfig(
                    [
                        "publish-official",
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
