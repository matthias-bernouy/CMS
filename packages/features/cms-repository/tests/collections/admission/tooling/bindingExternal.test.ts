import { describe, expect, test } from "bun:test";
import { buildCollectionBloc } from "@bernouy/cms-repository/collections/build";

describe("binding Bloc external", () => {
    test("maps the supported form mutation helpers to window.cmsRuntime", async () => {
        const viewSource = [
            `import { mutationFormRequest, MutationFormError } from "@bernouy/cms-content/browser";`,
            `customElements.define("demo-binding", class extends HTMLElement {`,
            `  static bindingApi = { mutationFormRequest, MutationFormError };`,
            `});`,
        ].join("\n");

        const bloc = await buildCollectionBloc({ tag: "demo-binding", viewSource });

        for (const name of ["mutationFormRequest", "MutationFormError"]) {
            expect(bloc.viewJS).toContain(`window.cmsRuntime.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/cms-content/browser");
    });
});
