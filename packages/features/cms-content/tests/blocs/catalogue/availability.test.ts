import { describe, expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/cms-content";

describe("bloc catalogue availability", () => {
    test("hides catalogue resources while retaining their rendering artifact", async () => {
        const repository = new InMemoryContentRepository();
        await repository.createBloc({
            id: "collection-card",
            name: "Collection card",
            group: "Content",
            description: "",
            catalogue: "hidden",
            viewJS: "cmsRuntime.registerBloc('collection-card', { mount() {} });",
            kind: "component",
            markupHTML: "<slot></slot>",
            ownership: { kind: "code-managed" },
        });

        expect(await repository.getBlocsList()).toEqual([]);
        expect((await repository.getBlocsList({ includeHidden: true })).map(({ id }) => id)).toEqual([
            "collection-card",
        ]);
        expect(await repository.getBlocViewJS("collection-card")).toContain("cmsRuntime.registerBloc");
        expect(await repository.getBlocRecord("collection-card")).not.toBeNull();
    });
});

test("rendering projections retain executable routing data and browser authority without editor insertion payloads", async () => {
    const repository = new InMemoryContentRepository();
    const markupHTML =
        '<iframe src="https://frames.example/embed" title="Example" sandbox="allow-scripts"></iframe><slot></slot>';
    const browser = { frames: { origins: ["https://frames.example"], sandbox: ["allow-scripts"] as const } };
    await repository.createBloc({
        id: "render-card",
        name: "Render card",
        kind: "component",
        markupHTML,
        browser,
        root: { accepts: ["div"] },
        ownership: { kind: "code-managed" },
        viewJS: "cmsRuntime.registerBloc('render-card', { mount() {} });",
        uses: [],
        initialDocument: { html: '<div cms-bloc="render-card"></div>' },
        slots: { default: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 0 } },
        styleCSS: ".render-card { color: red; }",
    });
    const catalogue = await repository.getBlocsList();
    expect(catalogue[0]!.initialDocument).toBeDefined();
    expect(catalogue[0]!.slots).toBeDefined();
    const rendering = await repository.getBlocsList({ projection: "rendering" });
    expect(rendering[0]).not.toHaveProperty("initialDocument");
    expect(rendering[0]).not.toHaveProperty("slots");
    expect(rendering[0]).not.toHaveProperty("viewJS");
    expect(rendering[0]).toMatchObject({
        id: "render-card",
        hasBehavior: true,
        root: { accepts: ["div"] },
        styleCSS: ".render-card { color: red; }",
        markupHTML,
        browser,
    });
    expect(rendering[0]!.browser).not.toBe(catalogue[0]!.browser);
    rendering[0]!.root.accepts[0] = "section";
    expect((await repository.getBlocsList())[0]!.root.accepts).toEqual(["div"]);
    expect(await repository.getBlocViewJS("render-card")).toContain("cmsRuntime.registerBloc");
});
