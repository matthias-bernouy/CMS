import { expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

test("provider media helpers use the host browser runtime", async () => {
    const view = new File(
        [
            `import { PROVIDER_IMAGE_WIDTHS, buildProviderImageAttributes, syncProviderMediaImage } from "@bernouy/cms-gateway/browser";`,
            `customElements.define("demo-provider-image", class extends HTMLElement {`,
            `  static media = { PROVIDER_IMAGE_WIDTHS, buildProviderImageAttributes, syncProviderMediaImage };`,
            `});`,
        ],
        "DemoProviderImage.ts",
        { type: "text/typescript" },
    );
    const bloc = await prepare_bloc(view, null, "Provider image", "Content", "", "demo-provider-image");
    for (const name of ["PROVIDER_IMAGE_WIDTHS", "buildProviderImageAttributes", "syncProviderMediaImage"]) {
        expect(bloc.viewJS).toContain(`window.p9r.${name}`);
    }
    expect(bloc.viewJS).not.toContain("@bernouy/cms-gateway/browser");
});
