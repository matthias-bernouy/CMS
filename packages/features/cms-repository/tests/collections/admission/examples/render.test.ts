import { expect, test } from "bun:test";
import { admitCollectionRelease } from "../../../../src/exports/collections/index";
import { renderCollectionExamples } from "../../../../src/exports/collections/build";
import { exampleCollection } from "./fixture";

test("example previews use the real composition renderer and keep explicit frame dimensions", async () => {
    const source = exampleCollection();
    source.examples[0].previews.push({
        id: "mobile",
        frame: { width: 390, height: 640 },
        locale: "fr",
        themeMode: "dark",
    });
    const artifact = await admitCollectionRelease(source);
    const result = await renderCollectionExamples(artifact);
    expect(result.frames).toHaveLength(4);
    const frame = result.frames.find((frame) => frame.path === "atlas-panel-default--mobile.html")!;
    expect(frame).toMatchObject({ width: 390, height: 640, locale: "fr", themeMode: "dark" });
    const html = await result.files.get(frame.path)!.text();
    expect(html).toContain("Bonjour");
    expect(html).toContain('data-theme-mode="dark"');
    expect(html).not.toContain("<slot");
    expect(await result.files.get("atlas-panel-default--mobile.css")!.text()).toContain("@scope");
    expect(await result.files.get("assembled--desktop.html")!.text()).toContain("Example &lt;copy&gt;");
    expect(result.files.has("bloc-runtime.js")).toBeTrue();
});
