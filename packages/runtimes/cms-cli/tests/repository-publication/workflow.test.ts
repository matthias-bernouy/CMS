import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const WORKFLOW = resolve(import.meta.dir, "../../../../../.github/workflows/publish-official-integrations.yml");

describe("official integration publication workflow", () => {
    test("is explicit and reusable without coupling publication to an image push", async () => {
        const source = await readFile(WORKFLOW, "utf8");

        expect(source).toContain("workflow_dispatch:");
        expect(source).toContain("workflow_call:");
        expect(source).not.toMatch(/^\s+push:/m);
        expect(source).toContain("contents: read");
        expect(source).toContain("repository publish-official --dry-run");
        expect(source).toContain("repository import-official-schema-baselines --dry-run");
    });

    test("keeps mutation and credentials on the private self-hosted runner", async () => {
        const source = await readFile(WORKFLOW, "utf8");

        expect(source).toContain("runs-on: [self-hosted, linux, repository-management]");
        expect(source).toContain("environment: ${{ inputs.deployment_environment }}");
        expect(source).toContain("MANAGEMENT_TOKEN: ${{ secrets.REPOSITORY_MANAGEMENT_TOKEN }}");
        expect(source).toContain("MAINTENANCE_TOKEN: ${{ secrets.REPOSITORY_MAINTENANCE_TOKEN }}");
        expect(source).toContain('printf \'%s\' "$MANAGEMENT_TOKEN" > "$REPOSITORY_TOKEN_FILE"');
        expect(source).toContain('printf \'%s\' "$MAINTENANCE_TOKEN" > "$REPOSITORY_MAINTENANCE_TOKEN_FILE"');
        expect(source).toContain('run: rm -f -- "$REPOSITORY_TOKEN_FILE"');
        expect(source).toContain('run: rm -f -- "$REPOSITORY_MAINTENANCE_TOKEN_FILE"');
        expect(source).not.toContain("--token=");
    });

    test("imports reviewed baselines before normal package publication", async () => {
        const source = await readFile(WORKFLOW, "utf8");
        const importJob = source.indexOf("  import-baselines:");
        const publishJob = source.indexOf("  publish:");

        expect(importJob).toBeGreaterThan(0);
        expect(publishJob).toBeGreaterThan(importJob);
        expect(source).toContain("needs: [plan, import-baselines]");
        expect(source).toContain("P9R_INTEGRATION_REPOSITORY_MAINTENANCE_URL: ${{ inputs.management_url }}");
        expect(source).toContain("repository import-official-schema-baselines");
    });
});
