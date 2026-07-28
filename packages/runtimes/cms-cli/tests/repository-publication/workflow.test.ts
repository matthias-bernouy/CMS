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
        expect(source).toContain("Submit and poll official candidates in deterministic order");
        expect(source).toContain("Per-candidate admission and polling timeout");
        expect(source).toContain("repository import-official-schema-baselines --dry-run");
        expect(source).toContain("repository backfill-official-verification --dry-run");
    });

    test("publishes remotely through the CMS while keeping maintenance private", async () => {
        const source = await readFile(WORKFLOW, "utf8");
        const maintenanceJob = jobSection(source, "import-baselines", "publish");
        const publishJob = jobSection(source, "publish");

        expect(maintenanceJob).toContain("runs-on: [self-hosted, linux, repository-management]");
        expect(maintenanceJob).toContain(
            "P9R_INTEGRATION_REPOSITORY_MAINTENANCE_URL: ${{ vars.REPOSITORY_MAINTENANCE_URL }}",
        );
        expect(maintenanceJob).toContain("MAINTENANCE_TOKEN: ${{ secrets.REPOSITORY_MAINTENANCE_TOKEN }}");
        expect(maintenanceJob).toContain('printf \'%s\' "$MAINTENANCE_TOKEN" > "$REPOSITORY_MAINTENANCE_TOKEN_FILE"');
        expect(maintenanceJob).toContain('run: rm -f -- "$REPOSITORY_MAINTENANCE_TOKEN_FILE"');

        expect(publishJob).toContain("runs-on: ubuntu-24.04");
        expect(publishJob).toContain("P9R_URL: ${{ vars.REPOSITORY_CMS_URL }}");
        expect(publishJob).toContain("P9R_TOKEN: ${{ secrets.P9R_TOKEN }}");
        expect(
            publishJob.slice(0, publishJob.indexOf("- name: Validate the CMS publication credential")),
        ).not.toContain("P9R_TOKEN");
        expect(publishJob.match(/P9R_TOKEN: \$\{\{ secrets\.P9R_TOKEN \}\}/gu)).toHaveLength(2);
        expect(publishJob).toContain("repository publish-official");
        expect(publishJob).not.toContain("P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL");
        expect(publishJob).not.toContain("P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE");
        expect(publishJob).not.toContain("P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP");
        expect(publishJob).not.toContain("REPOSITORY_TOKEN_FILE");
        expect(source).not.toContain("REPOSITORY_MANAGEMENT_TOKEN");
        expect(source).not.toContain("cms_url:");
        expect(source).not.toContain("maintenance_url:");
        expect(source).not.toContain("deployment_environment:");
        expect(source.match(/environment: integration-repository/gu)).toHaveLength(2);
        expect(source).not.toContain("--token=");
    });

    test("imports reviewed baselines and verification before normal package publication", async () => {
        const source = await readFile(WORKFLOW, "utf8");
        const importJob = source.indexOf("  import-baselines:");
        const publishJob = source.indexOf("  publish:");

        expect(importJob).toBeGreaterThan(0);
        expect(publishJob).toBeGreaterThan(importJob);
        expect(source).toContain("needs: [plan, import-baselines]");
        expect(source).toContain("P9R_INTEGRATION_REPOSITORY_MAINTENANCE_URL: ${{ vars.REPOSITORY_MAINTENANCE_URL }}");
        expect(source).toContain("repository import-official-schema-baselines");
        expect(source).toContain("repository backfill-official-verification");
        expect(source.indexOf("repository backfill-official-verification")).toBeLessThan(publishJob);
    });
});

function jobSection(source: string, name: string, nextName?: string): string {
    const start = source.indexOf(`  ${name}:`);
    const end = nextName ? source.indexOf(`  ${nextName}:`, start + 1) : source.length;
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}
