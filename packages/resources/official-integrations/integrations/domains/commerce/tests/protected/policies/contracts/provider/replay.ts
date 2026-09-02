import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerProviderReplayTest(): void {
    test("rejects duplicate provider event ids whose canonical payload changed", async () => {
        const schema = await loadCommerceSchemaSql();
        const replayGuard = functionSql(schema, "claim_provider_projection_event", "create_c2c_policy_revision");

        expect(replayGuard).toContain("v_existing.payload is distinct from");
        expect(replayGuard).toContain("provider event replay changed canonical payload");
        expect(schema.match(/claim_provider_projection_event\(/g)).toHaveLength(6);
    });
}
