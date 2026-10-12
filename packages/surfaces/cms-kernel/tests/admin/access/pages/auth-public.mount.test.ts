import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import KernelCms from "cms-kernel/KernelCms";
import { authSystem, CaptureRunner } from "../authPublicSupport";

describe("Kernel public auth mount", () => {
    test("mounts the configured public auth routes unguarded", async () => {
        const runner = new CaptureRunner();
        const { local, publicAuth } = authSystem();
        const cms = new KernelCms({
            runner,
            publicUrl: "http://admin.test",
            repository: new InMemoryCmsRepository(),
            authentication: local,
            publicAuth,
            authBackends: { local },
        });
        await cms.ready;
        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(true);
    });

    test("does not mount the old Source proxy", async () => {
        const runner = new CaptureRunner();
        const cms = new KernelCms({
            runner,
            publicUrl: "http://admin.test",
            repository: new InMemoryCmsRepository(),
            authentication: new InMemoryAuthentication(),
        });
        await cms.ready;
        expect(runner.handlers.has("POST /.cms/sources")).toBe(false);
        expect(runner.handlers.has("GET /assets/admin-runtime.js")).toBe(true);
        expect(runner.handlers.has("GET /assets/admin-styles.css")).toBe(true);
        expect(runner.handlers.has("GET /login")).toBe(true);
    });
});
