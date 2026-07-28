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
                P9R_URL: " HTTPS://Admin.Repository.Internal:443/cms/// ",
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS: "90000",
            }),
        ).toEqual({
            cmsUrl: "https://admin.repository.internal/cms",
            credentialLookupUrl: "HTTPS://Admin.Repository.Internal:443/cms",
            dryRun: false,
            source: { type: "official" },
            timeoutMs: 90_000,
        });
    });

    test("requires the repository CMS URL outside dry-run mode", () => {
        expect(() => parseRepositoryPublicationConfig(["publish-official"], {})).toThrow("requires a CMS URL");
        expect(() =>
            parseRepositoryPublicationConfig(["publish-official"], {
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL: "https://repository.internal/.cms/repository-management",
            }),
        ).toThrow("requires a CMS URL");
    });

    test("requires HTTPS outside loopback unless insecure HTTP is explicitly accepted", () => {
        expect(() =>
            parseRepositoryPublicationConfig(["publish-official", "--url=http://repository-admin.internal/cms"], {}),
        ).toThrow("must use HTTPS");
        expect(
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=http://repository-admin.internal/cms", "--allow-insecure-http"],
                {},
            ),
        ).toMatchObject({ cmsUrl: "http://repository-admin.internal/cms" });
        expect(
            parseRepositoryPublicationConfig(["publish-official", "--url=http://127.0.0.2:3000/cms"], {}),
        ).toMatchObject({ cmsUrl: "http://127.0.0.2:3000/cms" });
        expect(parseRepositoryPublicationConfig(["publish-official", "--url=http://[::1]:3000/cms"], {})).toMatchObject(
            { cmsUrl: "http://[::1]:3000/cms" },
        );
    });

    test("parses the insecure HTTP environment opt-in strictly", () => {
        const environment = {
            P9R_URL: "http://repository-admin.internal/cms",
        };
        expect(
            parseRepositoryPublicationConfig(["publish-official"], {
                ...environment,
                P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP: "true",
            }),
        ).toMatchObject({ cmsUrl: "http://repository-admin.internal/cms" });
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
        expect(() =>
            parseRepositoryPublicationConfig(
                ["publish-official", "--url=https://admin.repository.internal", "--token-file=/run/secrets/token"],
                {},
            ),
        ).toThrow("Unknown repository publication flag");
    });

    test("rejects ambient URL data and unbounded timeouts", () => {
        const base = ["publish-official"];
        for (const url of [
            "ftp://admin.repository/cms",
            "https://user:secret@admin.repository/cms",
            "https://admin.repository/cms?operation=publish",
            "https://admin.repository/cms#internal",
        ]) {
            expect(() => parseRepositoryPublicationConfig([...base, `--url=${url}`], {})).toThrow();
        }
        for (const timeout of ["0", "1800001", "1.5", "forever"]) {
            expect(() =>
                parseRepositoryPublicationConfig(
                    ["publish-official", "--url=https://admin.repository/cms", `--timeout-ms=${timeout}`],
                    {},
                ),
            ).toThrow("between 1 and 1800000");
        }
    });
});
