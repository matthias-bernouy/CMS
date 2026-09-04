import { describe, expect, test } from "bun:test";
import { assertLocalCompatibility, evaluateLocalCompatibility } from "../../src/release/compatibility";
import { installRequiredDependencies } from "../../src/release/sandbox/dependencies";
import type { ReleaseSandboxClient } from "../../src/release/sandbox/client";
import { verifyCollectionRelease } from "../../src/release/verification/collection";
import { releasePackage } from "./support";

describe("local release compatibility", () => {
    test("rejects a breaking patch before runtime verification", async () => {
        const baseline = await releasePackage("1.0.0");
        const candidate = await releasePackage("1.0.1", {
            inputs: [{ name: "account", label: "Account", type: "text", required: true }],
        });
        const result = evaluateLocalCompatibility(candidate, [baseline]);

        expect(result).toMatchObject({ contractAdmissible: false, requiredReleaseLevel: "major" });
        expect(() => assertLocalCompatibility(result)).toThrow(/requires a major version/);
    });

    test("keeps an installed dependency when it satisfies the target range", async () => {
        const owner = await releasePackage("4.0.0", {
            dependencies: [
                {
                    name: "dependency",
                    kind: "dependency",
                    versionRange: ">=2.0.0 <4.0.0",
                },
            ],
        });
        const latestDependency = await releasePackage("3.0.0", {}, "dependency");
        const calls: string[] = [];
        const client = {
            install: async (kind: string, version: string) => calls.push(`install:${kind}@${version}`),
            upgrade: async (kind: string, version: string) => calls.push(`upgrade:${kind}@${version}`),
        } as unknown as ReleaseSandboxClient;

        await installRequiredDependencies(owner, [latestDependency], new Map([["dependency", "2.1.0"]]), client);

        expect(calls).toEqual([]);
    });

    test("does not model internal collection controllers as selectable upgrade state", async () => {
        const definition = {
            schema: "cms.integration.definition.v2",
            type: "collection",
            resourceCategories: [{ id: "content", label: "Content" }],
            resources: [
                { id: "demo/blocs/card", type: "bloc", artifact: "demo-card", category: "content" },
                { id: "demo/blocs/controller", type: "bloc", artifact: "demo-controller", category: "content" },
            ],
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "demo-card", name: "Card", compositionHTML: "<p>Card</p>" },
                },
                {
                    type: "bloc",
                    bloc: {
                        tag: "demo-controller",
                        name: "Controller",
                        internal: true,
                        compositionHTML: "<div></div>",
                    },
                },
            ],
        };
        const baseline = await releasePackage("1.0.0", definition);
        const candidate = await releasePackage("1.0.1", definition);

        expect(
            verifyCollectionRelease(
                { candidate, sourceRoot: ".", baselines: [baseline], availablePackages: [] },
                () => undefined,
            ),
        ).toEqual({ scenarioCount: 2, resilienceScenarioCount: 0 });
    });
});
