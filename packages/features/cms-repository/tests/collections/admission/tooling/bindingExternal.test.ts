import { describe, expect, test } from "bun:test";
import { buildCollectionBloc } from "@bernouy/cms-repository/collections/build";

describe("binding Bloc external", () => {
    test("maps the supported form mutation helpers to window.cmsRuntime", async () => {
        const viewSource = [
            `import { sourceFormRequest, SourceFormError } from "@bernouy/cms-content/browser";`,
            `customElements.define("demo-binding", class extends HTMLElement {`,
            `  static bindingApi = { sourceFormRequest, SourceFormError };`,
            `});`,
        ].join("\n");

        const bloc = await buildCollectionBloc({ tag: "demo-binding", viewSource });

        for (const name of ["sourceFormRequest", "SourceFormError"]) {
            expect(bloc.viewJS).toContain(`window.cmsRuntime.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/cms-content/browser");
    });
});
