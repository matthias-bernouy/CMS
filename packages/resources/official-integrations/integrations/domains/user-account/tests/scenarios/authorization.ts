import { expect, test } from "bun:test";
import { createHarness } from "../harness/create";
import { jsonBody } from "../harness/responses";
import { activeEnv, functionsBaseUrl } from "../harness/runtime";

export function registerAuthorizationTest(): void {
    test("requires a CMS key and user id for user-scoped requests", async () => {
        const harness = await createHarness();

        const unauthorized = await harness.sourceFetch(`${functionsBaseUrl}/cms-user-account/health`, {
            headers: { authorization: "Bearer wrong" },
        });
        const missingUser = await harness.sourceFetch(`${functionsBaseUrl}/cms-user-account/personal-information`, {
            headers: { authorization: `Bearer ${activeEnv.CMS_USER_ACCOUNT_API_KEY}` },
        });

        expect(unauthorized.status).toBe(401);
        expect(await jsonBody(unauthorized)).toEqual({ error: "invalid CMS API key" });
        expect(missingUser.status).toBe(401);
        expect(await jsonBody(missingUser)).toEqual({ error: "missing x-user-id" });
    });
}
