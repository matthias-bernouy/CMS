import { describe, expect, test } from "bun:test";
import { createContentReader, InMemoryCmsRepository } from "@bernouy/cms-content";
import { TtlCache } from "@bernouy/http-runner";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import KernelCms from "cms-kernel/KernelCms";
import { authSystem, CaptureRunner } from "../authPublicSupport";
import { NOOP_LOGGER } from "@bernouy/logging";

describe("Kernel public auth mount", () => {
    test("mounts the configured public auth routes unguarded", async () => {
        const runner = new CaptureRunner();
        const { local, publicAuth } = authSystem();
        const cms = new KernelCms({
            runner,
            cache: new TtlCache(),
            content: createContentReader(new InMemoryCmsRepository()),
            authentication: local,
            publicAuth,
            authBackends: { local },
            logger: NOOP_LOGGER,
        });
        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(true);
        expect(runner.endpoints.has("GET /.cms/auth/methods")).toBe(true);
    });

    test("does not mount the old Source proxy", async () => {
        const runner = new CaptureRunner();
        const cms = new KernelCms({
            runner,
            cache: new TtlCache(),
            content: createContentReader(new InMemoryCmsRepository()),
            authentication: new InMemoryAuthentication(),
            logger: NOOP_LOGGER,
        });
        expect(runner.handlers.has("POST /.cms/sources")).toBe(false);
        expect(runner.handlers.has("GET /assets/admin-runtime.js")).toBe(false);
        expect(runner.handlers.has("GET /assets/admin-styles.css")).toBe(false);
        expect(runner.handlers.has("GET /login")).toBe(false);
        expect(runner.handlers.has("GET /.cms/auth/methods")).toBe(true);
    });
});
