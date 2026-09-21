import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { createControlAccessGuard } from "cms-control/core/admin/control/adminAccess";

describe("Control authenticated access", () => {
    test("allows authenticated members through the Control guard", async () => {
        expect(await status("GET", "/cms/api/users")).toBe(200);
        expect(await status("POST", "/cms/.cms/sources/commerce/refund")).toBe(200);
        expect(await status("GET", "/cms/admin/settings/secrets")).toBe(200);
    });
});

async function status(method: string, path: string): Promise<number> {
    const guard = createControlAccessGuard("/cms", new InMemoryAuthentication());
    const response = await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"));
    return response.status;
}
