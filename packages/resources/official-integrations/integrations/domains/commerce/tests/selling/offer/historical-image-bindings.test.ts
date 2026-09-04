import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BINDING_CORE_TAG, BindingCore } from "@bernouy/components/binding";
import { syncResponsiveSourceImageElement } from "@bernouy/cms-source-images/browser";
import accountOffersTemplate from "@bernouy/cms-official-integrations/integrations/ulvia/blocs/domains/commerce/commerce-account-offers/template.html" with {
    type: "text",
};
import { syncRenderedOffers } from "@bernouy/cms-official-integrations/integrations/ulvia/blocs/domains/commerce/commerce-account-offers/controller/presentation.ts";

const nativeFetch = globalThis.fetch;

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});

afterEach(() => {
    globalThis.fetch = nativeFetch;
    document.body.replaceChildren();
});

describe("historical Commerce image bindings", () => {
    test("serves the original when the real account template binds both missing dimensions to empty strings", async () => {
        globalThis.fetch = (async () =>
            ({
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        items: [
                            {
                                id: "offer-42",
                                slug: "historical-offer",
                                title: "Historical offer",
                                displayStatus: "online",
                                workflowState: "approved",
                                publiclyVisible: true,
                                mainImageMediaId: "42",
                            },
                        ],
                        total: 1,
                        limit: 12,
                        offset: 0,
                    }),
            }) as Response) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        const host = document.createElement("section") as HTMLElement & Record<string, any>;
        host.sourceBase = "/.cms/sources/commerce";
        host.status = "all";
        host.statusLabel = (status: string) => status;
        host.offerAction = () => ({ label: "View", url: "/offer" });
        host.innerHTML = accountOffersTemplate;
        host.querySelector("[data-offers-source]")?.setAttribute("cms-source", "/offers");
        core.append(host);
        document.body.append(core);

        const image = await waitForImage(host);
        expect(image.getAttribute("data-source-width")).toBe("");
        expect(image.getAttribute("data-source-height")).toBe("");

        syncRenderedOffers(host);
        expect(image.getAttribute("data-cms-src")).toBe("/.cms/sources/commerce/myOfferImage?id=42");
        expect(image.hasAttribute("src")).toBe(false);
        expect(image.hasAttribute("srcset")).toBe(false);

        expect(syncResponsiveSourceImageElement(image, false)).toBe(false);
        expect(image.getAttribute("src")).toBe("/.cms/sources/commerce/myOfferImage?id=42");
        expect(image.hasAttribute("srcset")).toBe(false);
    });
});

async function waitForImage(host: ParentNode): Promise<HTMLImageElement> {
    for (let attempt = 0; attempt < 100; attempt++) {
        const image = host.querySelector<HTMLImageElement>("[data-offer-image]");
        if (image && image.getAttribute("data-media-id") === "42") {
            return image;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("bound historical offer image did not render");
}
