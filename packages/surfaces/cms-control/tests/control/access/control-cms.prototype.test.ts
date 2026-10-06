import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "cms-control/ControlCms";
import { CaptureRunner } from "./authPublicSupport";

describe("ControlCms public surface", () => {
    test("exposes only the asynchronous mount result", () => {
        expect(Object.getOwnPropertyDescriptor(ControlCms.prototype, "filesMetadata")).toBeUndefined();
        expect(Object.getPrototypeOf(ControlCms.prototype)).toBe(Object.prototype);
    });

    test("allows omitted file backends while mounting the kernel", async () => {
        const cms = new ControlCms(new CaptureRunner(), new InMemoryCmsRepository(), new InMemoryAuthentication());
        await expect(cms.ready).resolves.toBeUndefined();
    });
});
