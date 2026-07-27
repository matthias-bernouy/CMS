import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    identifyIntegrationVerificationSuiteContent,
    type BoundIntegrationVerificationAuthorSuiteV1,
    type IntegrationVerificationSuiteContentV2,
} from "@bernouy/cms-integration-verification";

export async function authorSuite(
    source: string,
    fixtures: IntegrationVerificationSuiteContentV2["fixtures"] = [],
): Promise<BoundIntegrationVerificationAuthorSuiteV1> {
    const identified = await identifyIntegrationVerificationSuiteContent({
        schema: "cms.integration.verification-suite-content.v2",
        type: "conformance",
        suite: { suiteId: "implementation", entrypoint: "tests/implementation.ts" },
        sources: [
            {
                path: "tests/implementation.ts",
                file: { encoding: "utf8", content: source },
            },
        ],
        fixtures,
    });
    return {
        suiteId: "implementation",
        source: "author-conformance",
        contentDigest: identified.digest,
        content: identified.content,
    };
}

export function suiteSource(body: string): string {
    return `
        import { defineSuite, expect, test } from "@bernouy/cms-integration-verification/sdk/v1";
        export default defineSuite({ tests: [test("implementation", async (context) => {
            ${body}
        })] });
    `;
}

export async function temporaryRoot() {
    const root = await mkdtemp(join(tmpdir(), "cms-author-suite-test-"));
    return Object.freeze({
        root,
        async cleanup() {
            await rm(root, { recursive: true, force: true });
        },
    });
}
