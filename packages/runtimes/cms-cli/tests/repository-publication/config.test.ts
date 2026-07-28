import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseRepositoryPublicationConfig } from "../../src/repositoryPublication/config";

describe("repository publication configuration", () => {
    test("allows a credential-free dry run", () => {
        expect(parseRepositoryPublicationConfig(["publish-official", "--dry-run"], {})).toEqual({
            dryRun: true,
            source: { type: "official" },
            timeoutMs: 900_000,
        });
    });

    test("resolves one generic integration root without a version override", () => {
        expect(parseRepositoryPublicationConfig(["publish", "./integrations/demo", "--dry-run"], {})).toEqual({
            dryRun: true,
            source: { type: "integration", root: resolve("./integrations/demo") },
            timeoutMs: 900_000,
        });
        expect(() => parseRepositoryPublicationConfig(["publish", "--dry-run"], {})).toThrow(
            "requires an integration root",
        );
        expect(() =>
            parseRepositoryPublicationConfig(["publish", "./demo", "--version=1.2.0", "--dry-run"], {}),
        ).toThrow("Unknown repository publication flag");
    });

    test("shows generic publication help without requiring a root", () => {
        expect(parseRepositoryPublicationConfig(["publish", "--help"], {})).toBe("help");
        expect(parseRepositoryPublicationConfig(["publish", "-h"], {})).toBe("help");
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
            source: { type: "official" },
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

    test("requires HTTPS outside loopback unless insecure HTTP is explicitly accepted", () => {
        const token = "--token-file=/run/secrets/token";
        expect(() =>
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=http://cms-repository:3000/.cms/repository-management", token],
                {},
            ),
        ).toThrow("must use HTTPS");
        expect(
            parseRepositoryPublicationConfig(
                [
                    "publish-official",
                    "--url=http://cms-repository:3000/.cms/repository-management",
                    token,
                    "--allow-insecure-http",
                ],
                {},
            ),
        ).toMatchObject({ managementUrl: "http://cms-repository:3000/.cms/repository-management" });
        expect(
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=http://127.0.0.2:3000/.cms/repository-management", token],
                {},
            ),
        ).toMatchObject({ managementUrl: "http://127.0.0.2:3000/.cms/repository-management" });
        expect(
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=http://[::1]:3000/.cms/repository-management", token],
                {},
            ),
        ).toMatchObject({ managementUrl: "http://[::1]:3000/.cms/repository-management" });
    });

    test("parses the insecure HTTP environment opt-in strictly", () => {
        const environment = {
            P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL: "http://cms-repository:3000/.cms/repository-management",
            P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE: "/run/secrets/token",
        };
        expect(
            parseRepositoryPublicationConfig(["publish-official"], {
                ...environment,
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP: "true",
            }),
        ).toMatchObject({ managementUrl: "http://cms-repository:3000/.cms/repository-management" });
        expect(() =>
            parseRepositoryPublicationConfig(["publish-official"], {
                ...environment,
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP: "yes",
            }),
        ).toThrow("must be true or false");
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
        for (const timeout of ["0", "1800001", "1.5", "forever"]) {
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
            ).toThrow("between 1 and 1800000");
        }
    });
});
