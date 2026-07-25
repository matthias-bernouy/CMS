import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { CaptureRunner } from "./authPublicSupport";

describe("ControlCms public prototype contract", () => {
    test("keeps public accessors directly on ControlCms.prototype", () => {
        expect(typeof Object.getOwnPropertyDescriptor(ControlCms.prototype, "sources")?.get).toBe("function");
        expect(typeof Object.getOwnPropertyDescriptor(ControlCms.prototype, "filesMetadata")?.get).toBe("function");
        expect(typeof Object.getOwnPropertyDescriptor(ControlCms.prototype, "integrationPackageResolver")?.get).toBe(
            "function",
        );
        expect(Object.getPrototypeOf(ControlCms.prototype)).toBe(Object.prototype);
    });

    test("rejects falsy optional backends with the original error", async () => {
        const cms = new ControlCms(
            CaptureRunner.withoutFileApi(),
            new InMemoryCmsRepository(),
            new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
            {},
            undefined,
            undefined,
            false as never,
        );
        await cms.ready;

        expect(() => cms.filesMetadata).toThrow("files metadata backend not configured");
    });

    test("exposes the configured integration package resolver unchanged", async () => {
        const resolver = {
            resolve: async () => {
                throw new Error("not called");
            },
        };
        const cms = new ControlCms(
            CaptureRunner.withoutFileApi(),
            new InMemoryCmsRepository(),
            new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
            { integrationPackageResolver: resolver },
        );
        await cms.ready;

        expect(cms.config.integrationPackageResolver).toBe(resolver);
        expect(cms.integrationPackageResolver).toBe(resolver);
    });
});
