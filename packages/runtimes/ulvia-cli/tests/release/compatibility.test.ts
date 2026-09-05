import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { assertLocalCompatibility, evaluateLocalCompatibility } from "../../src/release/compatibility";
import { installRequiredDependencies } from "../../src/release/sandbox/dependencies";
import type { ReleaseSandboxClient } from "../../src/release/sandbox/client";
import { verifyCollectionRelease } from "../../src/release/verification/collection";
import { releasePackage } from "./support";

const encoded = (value: string) => Buffer.from(value).toString("base64");

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

    test("rejects a native-root composition even when definition parsing was bypassed", async () => {
        const candidate = await releasePackage("1.0.0", {
            schema: "cms.integration.definition.v2",
            type: "collection",
            resourceCategories: [{ id: "content", label: "Content" }],
            resources: [{ id: "demo/blocs/card", type: "bloc", artifact: "demo-card", category: "content" }],
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "demo-card", name: "Card", compositionHTML: "<p>Card</p>" },
                },
            ],
        });
        const nativeDefinition = {
            ...candidate.definition,
            resources: [{ id: "demo/blocs/paragraph", type: "bloc", artifact: "p", category: "content" }],
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "p", name: "Paragraph", compositionHTML: "<p>Text</p>" },
                },
            ],
        } as typeof candidate.definition;

        expect(() =>
            verifyCollectionRelease(
                {
                    candidate: { ...candidate, definition: nativeDefinition },
                    sourceRoot: ".",
                    baselines: [],
                    availablePackages: [],
                },
                () => undefined,
            ),
        ).toThrow(/Native HTML tag "p" is platform-owned/);
    });

    test("rejects an invalid managed native child before release", async () => {
        const candidate = await releasePackage("1.0.0", {
            schema: "cms.integration.definition.v2",
            type: "collection",
            resourceCategories: [{ id: "navigation", label: "Navigation" }],
            resources: [{ id: "demo/blocs/link", type: "bloc", artifact: "demo-link", category: "navigation" }],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "demo-link",
                        name: "Link",
                        nativeElement: "a",
                        viewJS: "export class DemoLink extends HTMLElement {}",
                        source: {
                            "manifest.json": encoded(JSON.stringify({ defaultContent: "./default.html" })),
                            "default.html": encoded("<demo-link><span>Wrong</span></demo-link>"),
                        },
                    },
                },
            ],
        });

        expect(() =>
            verifyCollectionRelease(
                { candidate, sourceRoot: ".", baselines: [], availablePackages: [] },
                () => undefined,
            ),
        ).toThrow(/requires exactly one direct, un-slotted <a> child/);
    });
});
