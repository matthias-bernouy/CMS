import { expect, test } from "bun:test";
import { buildCollectionBloc } from "@bernouy/cms-repository/collections/build";

test("provider media helpers use the host browser runtime", async () => {
    const viewSource = [
        `import { PROVIDER_IMAGE_WIDTHS, buildProviderImageAttributes, syncProviderMediaImage } from "@bernouy/cms-gateway/media/browser";`,
        `customElements.define("demo-provider-image", class extends HTMLElement {`,
        `  static media = { PROVIDER_IMAGE_WIDTHS, buildProviderImageAttributes, syncProviderMediaImage };`,
        `});`,
    ].join("\n");
    const bloc = await buildCollectionBloc({ tag: "demo-provider-image", viewSource });
    for (const name of ["PROVIDER_IMAGE_WIDTHS", "buildProviderImageAttributes", "syncProviderMediaImage"]) {
        expect(bloc.viewJS).toContain(`window.cmsRuntime.${name}`);
    }
    expect(bloc.viewJS).not.toContain("@bernouy/cms-gateway/media/browser");
});
