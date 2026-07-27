import { describe, expect, test } from "bun:test";
import { ContentValidationError } from "@bernouy/cms-content";
import postSiteBuilderBloc from "cms-control/api/_content/bloc/site-builder.post";
import { siteBlocHarness, siteDefinition, siteSnapshot } from "../fixtures";

describe("site-builder CLI import boundary", () => {
    test("regenerates trusted server sources instead of accepting client artifacts", async () => {
        const { cms, repository } = siteBlocHarness();
        const tag = "site-trusted-import";
        const definition = siteDefinition(tag, {
            draft: siteSnapshot({ defaultContent: "<script>FORGED_DEFAULT()</script>" }),
        });
        const form = definitionForm(tag, definition);
        form.set("force", "false");
        form.set("viewJS", "FORGED_VIEW();");
        form.set("editorJS", "FORGED_EDITOR();");
        form.set("source", JSON.stringify({ "Bloc.ts": btoa("FORGED_SOURCE();") }));

        const response = await postSiteBuilderBloc(request(form), cms);
        const published = await response.json();
        const source = (await repository.getBlocRecord(tag))?.artifact?.source;

        expect(response.status).toBe(200);
        expect(published.draft.defaultContent).toBe("");
        expect(Object.keys(source ?? {}).sort()).toEqual([
            "Bloc.ts",
            "BlocEditor.ts",
            "builder.json",
            "default.html",
            "manifest.json",
            "template.html",
        ]);
        const decoded = Object.values(source ?? {}).map((value) => Buffer.from(value, "base64").toString("utf-8"));
        expect(decoded.join("\n")).not.toContain("FORGED_");
        expect(JSON.parse(decoded.find((value) => value.includes('"schema": "cms.site-bloc.v1"'))!)).toEqual(published);
    });

    test("validates a new definition before reserving its global tag", async () => {
        const { cms, repository } = siteBlocHarness();
        const tag = "site-invalid-import";
        const definition = siteDefinition(tag, {
            draft: siteSnapshot({
                structure: [{ kind: "bloc", tag: "missing-dependency", attributes: {}, children: [] }],
            }),
        });

        await expect(postSiteBuilderBloc(request(definitionForm(tag, definition)), cms)).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        expect(await repository.getBlocRecord(tag)).toBeNull();
    });
});

function definitionForm(tag: string, definition: unknown): FormData {
    const form = new FormData();
    form.set("tag", tag);
    form.set("definition", JSON.stringify(definition));
    return form;
}

function request(body: FormData): Request {
    return new Request("http://localhost/cms/api/bloc/site-builder", { method: "POST", body });
}
