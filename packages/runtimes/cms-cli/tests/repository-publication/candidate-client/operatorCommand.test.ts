import { describe, expect, test } from "bun:test";
import { runRepositoryOperatorCommand } from "../../../src/repositoryPublication/candidate/operator/command";

describe("repository operator command", () => {
    test("uses the existing CMS PAT lookup and derives the management gateway URL", async () => {
        const output: string[] = [];
        const exit = await runRepositoryOperatorCommand(
            ["promote-stable", "commerce", "1.2.0", "--url=HTTPS://Admin.Repository.Internal:443/cms"],
            {
                environment: {},
                getAccessToken: async (cmsUrl) => {
                    expect(cmsUrl).toBe("HTTPS://Admin.Repository.Internal:443/cms");
                    return "pat-secret";
                },
                execute: async (config, request) => {
                    expect(config).toEqual({
                        managementUrl: "https://admin.repository.internal/cms/.cms/repository-management",
                        token: "pat-secret",
                        timeoutMs: 60_000,
                    });
                    expect(request).toEqual({ type: "promote-stable", kind: "commerce", version: "1.2.0" });
                    return { outcome: "promoted", reference: "promotion-1" };
                },
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(0);
        expect(output).toEqual(["PROMOTED commerce@1.2.0 reference=promotion-1"]);
        expect(output.join("\n")).not.toContain("pat-secret");
        expect(output.join("\n")).not.toContain("admin.repository.internal");
    });

    test("reports block channel repair without exposing credentials", async () => {
        const output: string[] = [];
        const exit = await runRepositoryOperatorCommand(
            ["block", "commerce", "1.2.0", "--reason=Security regression"],
            {
                environment: { P9R_URL: "https://admin.repository.example/cms" },
                getAccessToken: async () => "pat-secret",
                execute: async () => ({
                    outcome: "blocked",
                    reference: "block-1",
                    preview: {
                        current: { stable: "1.2.0", latest: "1.2.0" },
                        next: { stable: "1.1.0", latest: "1.1.0" },
                    },
                }),
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(0);
        expect(output).toEqual(["BLOCKED commerce@1.2.0 reference=block-1 stable=1.2.0->1.1.0 latest=1.2.0->1.1.0"]);
    });

    test("fails before HTTP when no CMS PAT is configured", async () => {
        const output: string[] = [];
        const exit = await runRepositoryOperatorCommand(["reevaluate", "commerce", "1.2.0", "--reason=Policy update"], {
            environment: { P9R_URL: "https://admin.repository.example/cms" },
            getAccessToken: async () => null,
            execute: async () => Promise.reject(new Error("must not execute")),
            write: (line) => output.push(line),
            writeError: (line) => output.push(line),
        });

        expect(exit).toBe(1);
        expect(output).toEqual([
            "No CMS Personal Access Token found; create one in admin Profile and configure P9R_TOKEN or credentials.json",
        ]);
    });

    test("prints only structured failure fields", async () => {
        const output: string[] = [];
        const exit = await runRepositoryOperatorCommand(["reevaluate", "commerce", "1.2.0", "--reason=Policy update"], {
            environment: { P9R_URL: "https://admin.repository.example/cms" },
            getAccessToken: async () => "pat-secret",
            execute: async () => ({
                outcome: "failed",
                reason: "upstream",
                status: 409,
                code: "integration_compatibility_stale",
            }),
            write: (line) => output.push(line),
            writeError: (line) => output.push(line),
        });

        expect(exit).toBe(1);
        expect(output).toEqual([
            "FAILED reevaluate commerce@1.2.0 reason=upstream status=409 code=integration_compatibility_stale",
        ]);
        expect(output.join("\n")).not.toContain("pat-secret");
    });
});
