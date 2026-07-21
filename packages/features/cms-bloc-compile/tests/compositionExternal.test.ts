import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("Composition view external", () => {
    test("keeps nested template tags and reads the public runtime global", async () => {
        const view = new File(
            [
                `import { Composition } from "@bernouy/components/base";`,
                `export class DemoComposition extends Composition {`,
                `  constructor() { super({ template: "<base-nav></base-nav>" }); }`,
                `}`,
            ],
            "DemoComposition.ts",
            { type: "text/typescript" },
        );

        const bloc = await prepare_bloc(view, null, "Demo composition", "Composition", "", "demo-composition");

        expect(bloc.viewJS).toContain("window.p9r.Composition");
        expect(bloc.viewJS).toContain("<base-nav></base-nav>");
        expect(bloc.viewJS).not.toContain("cms-control");
    });
});
