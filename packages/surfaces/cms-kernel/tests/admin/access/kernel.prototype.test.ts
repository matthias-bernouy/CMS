import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { createContentReader, InMemoryCmsRepository } from "@bernouy/cms-content";
import KernelCms from "cms-kernel/KernelCms";
import { TtlCache } from "@bernouy/http-runner";
import { CaptureRunner } from "./authPublicSupport";

describe("KernelCms application", () => {
    test("does not expose persistence adapters as public properties", () => {
        expect(Object.getOwnPropertyDescriptor(KernelCms.prototype, "filesMetadata")).toBeUndefined();
    });

    test("mounts from one explicit configuration object", () => {
        expect(
            new KernelCms({
                runner: new CaptureRunner(),
                cache: new TtlCache(),
                content: createContentReader(new InMemoryCmsRepository()),
                authentication: new InMemoryAuthentication(),
            }),
        ).toBeInstanceOf(KernelCms);
    });
});
