import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("Source image Bloc external", () => {
    test("maps every public browser runtime export to window.p9r", async () => {
        const view = new File(
            [
                `import {`,
                `  SOURCE_IMAGE_WIDTHS,`,
                `  applyResponsiveSourceImageAttributes,`,
                `  buildResponsiveSourceImageAttributes,`,
                `  clearResponsiveSourceImageAttributes,`,
                `  clearResponsiveSourceImageElement,`,
                `  syncResponsiveSourceImageElement,`,
                `} from "@bernouy/cms-source-images/browser";`,
                `customElements.define("demo-image", class extends HTMLElement {`,
                `  static sourceImageApi = {`,
                `    SOURCE_IMAGE_WIDTHS,`,
                `    applyResponsiveSourceImageAttributes,`,
                `    buildResponsiveSourceImageAttributes,`,
                `    clearResponsiveSourceImageAttributes,`,
                `    clearResponsiveSourceImageElement,`,
                `    syncResponsiveSourceImageElement,`,
                `  };`,
                `});`,
            ],
            "DemoImage.ts",
            { type: "text/typescript" },
        );

        const bloc = await prepare_bloc(view, null, "Image demo", "Content", "", "demo-image");

        for (const name of [
            "SOURCE_IMAGE_WIDTHS",
            "applyResponsiveSourceImageAttributes",
            "buildResponsiveSourceImageAttributes",
            "clearResponsiveSourceImageAttributes",
            "clearResponsiveSourceImageElement",
            "syncResponsiveSourceImageElement",
        ]) {
            expect(bloc.viewJS).toContain(`window.p9r.${name}`);
        }
        expect(bloc.viewJS).not.toContain("@bernouy/cms-source-images");
    });

    test("does not expose the host-only rollout factory to blocs", async () => {
        const view = new File(
            [
                `import { createResponsiveSourceImageBrowserApi } from "@bernouy/cms-source-images/browser";`,
                `customElements.define("demo-image-policy", class extends HTMLElement {`,
                `  static api = createResponsiveSourceImageBrowserApi(true);`,
                `});`,
            ],
            "DemoImagePolicy.ts",
            { type: "text/typescript" },
        );

        await expect(prepare_bloc(view, null, "Image policy", "Content", "", "demo-image-policy")).rejects.toThrow(
            /No matching export.*createResponsiveSourceImageBrowserApi/,
        );
    });
});
