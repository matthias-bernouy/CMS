import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "./authPublicSupport";

describe("KernelCms application", () => {
    test("does not expose persistence adapters as public properties", () => {
        expect(Object.getOwnPropertyDescriptor(KernelCms.prototype, "filesMetadata")).toBeUndefined();
    });

    test("mounts from one explicit configuration object", async () => {
        const cms = new KernelCms({
            runner: new CaptureRunner(),
            publicUrl: "http://site.test",
            repository: new InMemoryCmsRepository(),
            authentication: new InMemoryAuthentication(),
        });
        await expect(cms.ready).resolves.toBeUndefined();
    });
});
