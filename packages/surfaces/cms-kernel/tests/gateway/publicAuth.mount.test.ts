import { describe, expect, test } from "bun:test";
import { createContentReader, InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "./support/CaptureRunner";

describe("Kernel authentication boundary", () => {
    test("does not expose authentication endpoints owned by the Access contract", () => {
        const runner = new CaptureRunner();
        new KernelCms({
            runner,
            cache: new InMemoryCache(),
            content: createContentReader(new InMemoryCmsRepository()),
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
        });

        for (const route of ["/.cms/auth/login", "/.cms/auth/signup", "/.cms/auth/me", "/auth/login"]) {
            expect(() => runner.endpointHandler("POST", route)).toThrow();
            expect(() => runner.endpointHandler("GET", route)).toThrow();
        }
    });
});
