import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { integrationRoot } from "../paths";

export function registerAuditedFeePolicyTest(): void {
    test("fails closed without an explicitly audited fee policy", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");

        expect(schema).toContain("'c2c-default', 2, 'Protected C2C configuration required', 'draft'");
        expect(schema).not.toContain("Pre-release zero-fee subsidy");
        expect(schema).not.toContain("id, 9007199254740991");
        expect(schema).toContain("an audited subsidy amount and reason are required");
    });
}
