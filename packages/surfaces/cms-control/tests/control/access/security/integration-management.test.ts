import { expect, test } from "bun:test";
import { InMemoryAuthentication, type Authentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { CaptureRunner } from "../authPublicSupport";

test("every management route is protected by the administrator middleware", async () => {
    for (const role of [null, "user", "admin"] as const) {
        const runner = new CaptureRunner();
        const memory = new InMemoryAuthentication<CMS_ROLES>({ role: role ?? "user" });
        const auth: Authentication<CMS_ROLES> = role
            ? memory
            : {
                  loginUrl: "/login",
                  logoutUrl: "/logout",
                  profileUrl: "/profile",
                  getSubject: async () => null,
                  buildLoginUrl: () => "/login",
                  buildLogoutUrl: () => "/logout",
              };
        const cms = new ControlCms(runner, new InMemoryCmsRepository(), auth);
        await cms.ready;
        for (const [method, endpoint] of [
            ["GET", "health"],
            ["GET", "settings"],
            ["POST", "settings"],
            ["POST", "action"],
        ]) {
            const path = `/api/integrations/management/${endpoint}`;
            const chain = runner.middlewareChains.get(`${method} ${path}`)!;
            expect(chain.length).toBeGreaterThan(0);
            let invoked = false;
            const request = new Request(`https://control.test${path}`, { method });
            const next = chain.reduceRight<() => Promise<Response>>(
                (next, middleware) => async () => middleware(request, next),
                async () => {
                    invoked = true;
                    return new Response("ok");
                },
            );
            const response = await next();
            expect(invoked).toBe(role === "admin");
            expect(response.status).toBe(role === "admin" ? 200 : role ? 403 : 302);
        }
    }
});
