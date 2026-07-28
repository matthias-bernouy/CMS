import { describe, expect, test } from "bun:test";
import { changedIntegrationPackagePaths } from "@bernouy/cms-integration-registry";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";

describe("integration publication changed paths", () => {
    test("returns exact sorted additions, removals, content changes, and encoding changes", () => {
        const baseline = envelope({
            "removed.ts": { encoding: "utf8", content: "removed" },
            "content.ts": { encoding: "utf8", content: "before" },
            "encoding.ts": { encoding: "utf8", content: "YWZ0ZXI=" },
            "unchanged.ts": { encoding: "utf8", content: "same" },
        });
        const candidate = envelope({
            "added.ts": { encoding: "utf8", content: "added" },
            "content.ts": { encoding: "utf8", content: "after" },
            "encoding.ts": { encoding: "base64", content: "WVdaMFpYST0=" },
            "unchanged.ts": { encoding: "utf8", content: "same" },
        });

        expect(changedIntegrationPackagePaths(baseline, candidate)).toEqual([
            "added.ts",
            "content.ts",
            "encoding.ts",
            "removed.ts",
        ]);
    });
});

function envelope(files: IntegrationPackageEnvelopeV1["files"]): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "README.md",
        files,
    };
}
