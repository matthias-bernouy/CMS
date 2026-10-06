import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { ControlCms } from "cms-control/ControlCms";
import { authSystem, CaptureRunner } from "../authPublicSupport";

describe("Control public auth mount", () => {
    test("mounts public auth routes unguarded and disables signup", async () => {
        const runner = new CaptureRunner();
        const { local, publicAuth } = authSystem();
        const cms = new ControlCms(runner, new InMemoryCmsRepository(), local, {
            configuration: { publicAuth },
            authBackends: { local },
        });
        await cms.ready;
        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(false);
    });

    test("does not mount the old Source proxy", async () => {
        const runner = new CaptureRunner();
        const cms = new ControlCms(runner, new InMemoryCmsRepository(), new InMemoryAuthentication());
        await cms.ready;
        expect(runner.handlers.has("POST /.cms/sources")).toBe(false);
        expect(runner.handlers.has("GET /assets/control-runtime.js")).toBe(true);
        expect(runner.handlers.has("GET /assets/control-styles.css")).toBe(true);
        expect(runner.handlers.has("GET /admin")).toBe(true);
        expect(await runner.handlers.get("GET /admin")!(new Request("http://control.test/admin"))).toMatchObject({
            status: 503,
        });
    });
});
