import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const testsRoot = resolve(import.meta.dir);
const integrationRoot = resolve(import.meta.dir, "../../integrations/commerce");
const exceptionalFiles = new Set([
    "versions/1.0.0/README.md",
    "versions/1.0.0/definition.json",
    "versions/1.0.0/connectors/supabase/schema.sql",
    "versions/1.0.0/connectors/supabase/functions/cms-commerce/routes/configuration/protected-policies.ts",
    "versions/1.0.0/blocs/commerce-offer-price-form/Bloc.ts",
]);
const exceptionalDirectories = new Set([
    "versions/1.0.0/connectors/supabase/functions/cms-commerce/routes/order",
]);
const exceptionalTestFiles = new Set([
    "schema-smoke.sql",
    "contracts/output-shapes.test.ts",
    "catalog/schema-taxonomy-smoke.sql",
    "catalog/definition.test.ts",
    "protected/payment-cancellation-smoke.sql",
    "protected/platform-liability-smoke.sql",
    "protected/settlement-smoke.sql",
    "protected/delivery-saga-smoke.sql",
    "protected/policy-contract.test.ts",
    "protected/resolution.test.ts",
    "sales/security.test.ts",
    "blocs/sales-blocs.test.ts",
]);
const exceptionalTestDirectories = new Set([
    "protected",
]);

describe("commerce source structure", () => {
    test("keeps folders small and source files focused", async () => {
        const violations = [
            ...await inspectTree(integrationRoot, exceptionalFiles, exceptionalDirectories),
            ...await inspectTree(testsRoot, exceptionalTestFiles, exceptionalTestDirectories),
        ];

        expect(violations).toEqual([]);
    });
});

async function inspectTree(
    root: string,
    exceptions = new Set<string>(),
    directoryExceptions = new Set<string>(),
): Promise<string[]> {
    const violations: string[] = [];
    await visit(root, root, exceptions, directoryExceptions, violations);
    return violations;
}

async function visit(
    root: string,
    directory: string,
    exceptions: Set<string>,
    directoryExceptions: Set<string>,
    violations: string[],
): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile());
    const label = relative(root, directory) || ".";
    if (files.length > 8 && !directoryExceptions.has(label)) {
        violations.push(`${label}: ${files.length} files`);
    }

    for (const file of files) {
        const path = resolve(directory, file.name);
        const relativePath = relative(root, path);
        if (exceptions.has(relativePath)) continue;
        const source = await readFile(path, "utf8");
        const lines = source.split(/\r?\n/).length;
        if (lines > 180) violations.push(`${relativePath}: ${lines} lines`);
    }
    for (const child of entries.filter(entry => entry.isDirectory())) {
        await visit(root, resolve(directory, child.name), exceptions, directoryExceptions, violations);
    }
}
