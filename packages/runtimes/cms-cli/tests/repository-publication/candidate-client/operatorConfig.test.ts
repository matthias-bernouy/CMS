import { describe, expect, test } from "bun:test";
import { parseRepositoryOperatorConfig } from "../../../src/repositoryPublication/candidate/operator/config";

describe("repository operator configuration", () => {
    test("parses CMS PAT operations and preserves the credential lookup key", () => {
        expect(
            parseRepositoryOperatorConfig(
                [
                    "promote-stable",
                    "commerce",
                    "1.2.0",
                    "--reason=Release approved",
                    "--url=HTTPS://Admin.Repository.Internal:443/cms/",
                ],
                {},
            ),
        ).toEqual({
            cmsUrl: "https://admin.repository.internal/cms",
            credentialLookupUrl: "HTTPS://Admin.Repository.Internal:443/cms",
            operation: {
                type: "promote-stable",
                kind: "commerce",
                version: "1.2.0",
                reason: "Release approved",
            },
            timeoutMs: 60_000,
        });
    });

    test("uses P9R_URL and requires reasons for destructive or audit operations", () => {
        expect(
            parseRepositoryOperatorConfig(["block", "commerce", "1.2.0", "--reason=Security regression"], {
                P9R_URL: "https://admin.repository.example/cms",
            }),
        ).toMatchObject({
            operation: { type: "block", kind: "commerce", version: "1.2.0", reason: "Security regression" },
        });
        expect(() =>
            parseRepositoryOperatorConfig(["block", "commerce", "1.2.0"], {
                P9R_URL: "https://admin.repository.example/cms",
            }),
        ).toThrow("require --reason=<text>");
        expect(() =>
            parseRepositoryOperatorConfig(["reevaluate", "commerce", "1.2.0", "--reason= trailing "], {
                P9R_URL: "https://admin.repository.example/cms",
            }),
        ).toThrow("canonical text");
    });

    test("enforces HTTPS unless insecure HTTP is explicitly enabled", () => {
        expect(() =>
            parseRepositoryOperatorConfig(
                ["promote-stable", "commerce", "1.2.0", "--url=http://repository.example/cms"],
                {},
            ),
        ).toThrow("must use HTTPS");
        expect(
            parseRepositoryOperatorConfig(
                [
                    "reevaluate",
                    "commerce",
                    "1.2.0",
                    "--reason=Policy update",
                    "--url=http://repository.example/cms",
                    "--allow-insecure-http",
                ],
                {},
            ),
        ).toMatchObject({ cmsUrl: "http://repository.example/cms" });
    });

    test("rejects invalid targets and unknown flags without echoing values", () => {
        expect(() =>
            parseRepositoryOperatorConfig(
                ["promote-stable", "not valid", "1.2.0", "--url=https://repository.example/cms"],
                {},
            ),
        ).toThrow("kind or version is invalid");
        try {
            parseRepositoryOperatorConfig(
                ["promote-stable", "commerce", "1.2.0", "--secret=do-not-echo", "--url=https://example.com"],
                {},
            );
            throw new Error("Expected parsing to fail");
        } catch (error) {
            expect(String(error)).not.toContain("do-not-echo");
        }
    });
});
