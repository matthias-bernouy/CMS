import { expect, test } from "bun:test";
import { loadCommerceSchemaSql } from "../paths";

export function registerAuditedFeePolicyTest(): void {
    test("fails closed without an explicitly audited fee policy", async () => {
        const schema = await loadCommerceSchemaSql();

        expect(schema).toContain("'c2c-default', 2, 'Protected C2C configuration required', 'draft'");
        expect(schema).not.toContain("Pre-release zero-fee subsidy");
        expect(schema).not.toContain("id, 9007199254740991");
        expect(schema).toContain("an audited subsidy amount and reason are required");
    });
}
