import { describe, expect, test } from "bun:test";
import { buildCollectionBloc } from "../src/exports";

describe("binding Bloc external", () => {
    test("maps the public source coordination helpers to window.cmsRuntime", async () => {
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

        const bloc = await buildCollectionBloc(view, "Binding demo", "Content", "", "demo-binding");

        for (const name of [
            "observeSource",
            "readSourceData",
            "refreshSourceContext",
            "setSourceContext",
            "sourceFormRequest",
            "SourceFormError",
        ]) {
            expect(bloc.viewJS).toContain(`window.cmsRuntime.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/components/binding");
    });
});
