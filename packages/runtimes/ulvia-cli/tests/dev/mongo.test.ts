import { describe, expect, test } from "bun:test";
import { planMongoContainerAction } from "../../src/runtime/mongo";

describe("local MongoDB container lifecycle", () => {
    test("creates a missing container", () => {
        expect(planMongoContainerAction(null, null, 27_019)).toBe("create");
    });

    test("recreates a partial container without a published port", () => {
        expect(planMongoContainerAction("created", null, 27_019)).toBe("recreate");
    });

    test("recreates a container when the configured port changes", () => {
        expect(planMongoContainerAction("exited", 27_019, 27_119)).toBe("recreate");
        expect(planMongoContainerAction("running", 27_019, 27_119)).toBe("recreate");
    });

    test("starts or reuses a container on the requested port", () => {
        expect(planMongoContainerAction("exited", 27_019, 27_019)).toBe("start");
        expect(planMongoContainerAction("running", 27_019, 27_019)).toBe("reuse");
    });
});
