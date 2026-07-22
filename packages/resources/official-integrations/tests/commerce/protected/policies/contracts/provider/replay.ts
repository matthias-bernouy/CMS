import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerProviderReplayTest(): void {
    test("rejects duplicate provider event ids whose canonical payload changed", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const replayGuard = functionSql(schema, "claim_provider_projection_event", "create_c2c_policy_revision");

        expect(replayGuard).toContain("v_existing.payload is distinct from");
        expect(replayGuard).toContain("provider event replay changed canonical payload");
        expect(schema.match(/claim_provider_projection_event\(/g)).toHaveLength(6);
    });
}
