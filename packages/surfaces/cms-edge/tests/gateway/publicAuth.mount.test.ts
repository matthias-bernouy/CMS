import { describe, expect, test } from "bun:test";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import EdgeCms from "cms-edge/EdgeCms";
import { CaptureRunner } from "./support/CaptureRunner";

describe("Edge authentication boundary", () => {
    test("does not expose authentication endpoints owned by the Access contract", () => {
        const runner = new CaptureRunner();
        const content = createContentReader(new InMemoryContentRepository());
        new EdgeCms({
            runner,
            resourceHandler: async () => new Response(null, { status: 404 }),
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
        });

        for (const route of ["/.cms/auth/login", "/.cms/auth/signup", "/.cms/auth/me", "/auth/login"]) {
            expect(() => runner.endpointHandler("POST", route)).toThrow();
            expect(() => runner.endpointHandler("GET", route)).toThrow();
        }
    });
});
