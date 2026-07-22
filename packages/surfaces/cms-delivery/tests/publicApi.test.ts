import { describe, expect, test } from "bun:test";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { CaptureRunner } from "./gateway/support/CaptureRunner";

describe("cms-delivery public API", () => {
    test("exports a surface that mounts its public fallback on an injected runner", () => {
        const runner = new CaptureRunner();

        const delivery = new DeliveryCms({
            runner,
            repository: {},
        });

        expect(delivery).toBeInstanceOf(DeliveryCms);
        expect(typeof runner.defaultHandler("GET", "/")).toBe("function");
    });
});
