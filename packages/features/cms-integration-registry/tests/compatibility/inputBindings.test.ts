import { describe, expect, test } from "bun:test";
import { evaluator, packageState } from "./fixtures";

describe("integration input compatibility", () => {
    test("compares object-list inputs without applying value-input options", () => {
        const objectList = {
            name: "items",
            label: "Items",
            type: "object-list",
            fields: [{ name: "title", label: "Title", type: "text" }],
        };
        const baseline = packageState("1.0.0", { inputs: [objectList] });
        const unchanged = evaluator().evaluate({
            baseline,
            candidate: packageState("1.0.1", { inputs: [objectList] }),
        });
        const changedType = evaluator().evaluate({
            baseline,
            candidate: packageState("1.0.1", {
                inputs: [{ name: "items", label: "Items", type: "text" }],
            }),
        });

        expect(unchanged.contractAdmissible).toBeTrue();
        expect(changedType.evidence).toContainEqual(expect.objectContaining({ code: "input-narrowed" }));
    });
});
