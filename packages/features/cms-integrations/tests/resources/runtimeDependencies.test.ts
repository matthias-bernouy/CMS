import { describe, expect, test } from "bun:test";
import { integrationRuntimeDependencies } from "@bernouy/cms-integrations";
import { collectionDefinition, sourceDefinition } from "./fixtures";

describe("integration runtime dependencies", () => {
    test("keeps required declared dependencies and omits optional ones", () => {
        const source = sourceDefinition();
        source.dependencies = [
            { name: "required", kind: "required", versionRange: "^1.0.0" },
            { name: "optional", kind: "optional", versionRange: "^1.0.0", optional: true },
        ];

        expect(integrationRuntimeDependencies(source)).toEqual([{ kind: "required", versionRange: "^1.0.0" }]);
    });

    test("includes collection theme, endpoint, and resource contracts", () => {
        const collection = collectionDefinition({
            theme: {
                dependencies: [{ kind: "tokens", versionRange: "^2.0.0" }],
                categories: [],
            },
            resources: [
                {
                    id: "ulvia/blocs/card",
                    type: "bloc",
                    artifact: "ulvia-card",
                    category: "content",
                    endpoints: [
                        {
                            source: "commerce",
                            sourceVersion: "^3.0.0",
                            endpoint: "urn:commerce:listOffers",
                            contractVersion: "^1.0.0",
                        },
                    ],
                    requires: {
                        collections: [{ kind: "layout", versionRange: "^1.0.0", resources: ["layout/blocs/grid"] }],
                    },
                },
            ],
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "ulvia-card", name: "Card", compositionHTML: "<article></article>" },
                },
            ],
        });

        expect(integrationRuntimeDependencies(collection)).toEqual([
            { kind: "commerce", versionRange: "^3.0.0" },
            { kind: "layout", versionRange: "^1.0.0" },
            { kind: "tokens", versionRange: "^2.0.0" },
        ]);
    });
});
