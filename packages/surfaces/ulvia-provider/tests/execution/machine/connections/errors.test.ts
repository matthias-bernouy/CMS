import { expect, test } from "bun:test";
import { ProviderConnectionConflict } from "@bernouy/cms-gateway/provider";
import { connectionInput, connectionTransport } from "./transport";

test("pairing preserves revision conflicts and never reveals internal tokens", async () => {
    for (const [error, status, code] of [
        [new ProviderConnectionConflict(), 409, "REVISION_CONFLICT"],
        [new Error(`Internal storage failure: ${connectionInput.token}`), 503, "CORE_UNAVAILABLE"],
    ] as const) {
        const call = await connectionTransport({
            configure: async () => {
                throw error;
            },
        });
        const response = await call();
        expect(response.status).toBe(status);
        const text = await response.text();
        expect(text).toContain(code);
        expect(text).not.toContain(connectionInput.token);
        expect(text).not.toContain("Internal storage failure");
    }
});
