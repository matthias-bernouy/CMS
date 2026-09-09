import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("binding Bloc external", () => {
    test("maps the public source coordination helpers to window.p9r", async () => {
        const view = new File(
            [
                `import { observeSource, readSourceData, refreshSourceContext, setSourceContext, sourceFormRequest, SourceFormError } from "@bernouy/components/binding";`,
                `customElements.define("demo-binding", class extends HTMLElement {`,
                `  static bindingApi = { observeSource, readSourceData, refreshSourceContext, setSourceContext, sourceFormRequest, SourceFormError };`,
                `});`,
            ],
            "DemoBinding.ts",
            { type: "text/typescript" },
        );

        const bloc = await prepare_bloc(view, null, "Binding demo", "Content", "", "demo-binding");

        for (const name of [
            "observeSource",
            "readSourceData",
            "refreshSourceContext",
            "setSourceContext",
            "sourceFormRequest",
            "SourceFormError",
        ]) {
            expect(bloc.viewJS).toContain(`window.p9r.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/components/binding");
    });
});
