import { expect, test } from "bun:test";
import { admitCollectionRelease } from "../../../../src/exports/collections/index";
import { renderCollectionExamples } from "../../../../src/exports/collections/build";
import { exampleCollection } from "./fixture";

test("one immutable example renders collection texts in different contexts while keeping its frames", async () => {
    const source = exampleCollection();
    source.examples[0].previews.push({ id: "mobile", frame: { width: 390, height: 640 } });
    source.theme = {
        label: "example.label",
        categories: [
            {
                id: "colors",
                label: "example.label",
                entries: [
                    {
                        id: "background",
                        label: "example.label",
                        type: "color",
                        defaults: { light: "#ffffff", dark: "#101010" },
                    },
                ],
            },
        ],
    };
    const artifact = await admitCollectionRelease(source);
    const before = artifact.canonicalJson;
    const dark = await renderCollectionExamples(artifact, [], undefined, { locale: "fr", themeMode: "dark" });
    const light = await renderCollectionExamples(artifact);
    const frame = dark.frames.find((frame) => frame.path === "atlas-panel-default--mobile.html")!;
    expect(frame).toMatchObject({ width: 390, height: 640, locale: "fr", themeMode: "dark" });
    expect(dark.frames).toHaveLength(4);
    expect(dark.frames.map(({ width, height }) => [width, height])).toEqual(
        light.frames.map(({ width, height }) => [width, height]),
    );
    const html = await dark.files.get(frame.path)!.text();
    expect(html).toContain("Bonjour");
    expect(html).toContain('data-theme-mode="dark"');
    expect(html).not.toContain("<slot");
    expect(await dark.files.get("atlas-panel-default--mobile.css")!.text()).toContain("@scope");
    expect(await light.files.get(frame.path)!.text()).toContain("Hello &lt;copy&gt;");
    expect(light.frames[0]).toMatchObject({ locale: "en-US", themeMode: "light" });
    expect(await dark.files.get("atlas-panel-default--mobile.css")!.text()).toContain("#101010");
    expect(await light.files.get("atlas-panel-default--mobile.css")!.text()).toContain("#ffffff");
    expect(artifact.canonicalJson).toBe(before);
    expect(dark.files.has("bloc-runtime.js")).toBeTrue();
});

test("rendering validates its locale and theme context independently of example admission", async () => {
    const artifact = await admitCollectionRelease(exampleCollection());
    for (const options of [{ locale: "not_a_locale" }, { locale: "" }, { themeMode: "unsupported" }]) {
        await expect(renderCollectionExamples(artifact, [], undefined, options as never)).rejects.toThrow("rendering");
    }
});
