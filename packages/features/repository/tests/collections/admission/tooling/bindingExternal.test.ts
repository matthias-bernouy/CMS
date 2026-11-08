import { describe, expect, test } from "bun:test";
import { buildCollectionBloc } from "repository/collections/tooling/buildCollectionBloc";

describe("binding Bloc external", () => {
    test("maps the supported form mutation helpers to window.cmsRuntime", async () => {
        const viewSource = [
            `import { mutationFormRequest, MutationFormError } from "@bernouy/content/browser";`,
            `export function mount(root) {`,
            `  root.bindingApi = { mutationFormRequest, MutationFormError };`,
            `}`,
        ].join("\n");

        const bloc = await buildCollectionBloc({ tag: "example--demo--binding", viewSource });

        for (const name of ["mutationFormRequest", "MutationFormError"]) {
            expect(bloc.viewJS).toContain(`window.cmsRuntime.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/content/browser");
    });
});
