import { describe, expect, test } from "bun:test";
import { Bloc as SellBloc } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/selling/sell/Bloc.ts";

const TAG = "mossa-sell-photo-policy-test";

describe("Commerce selling photo policy", () => {
    test("renders creator-authored copy from slots", () => {
        if (!customElements.get(TAG)) {
            customElements.define(TAG, SellBloc);
        }
        const sell = document.createElement(TAG) as SellBloc;
        sell.innerHTML = `
            <span slot="copy-step-product">Choose a product</span>
            <span slot="copy-submit">Submit the offer</span>
            <span slot="copy-model">Product model</span>
            <span slot="copy-photo-formats">Supported images, up to 5 MiB each.</span>
            <span slot="copy-photo-requirement-exact">Choose {minimum} images.</span>
        `;
        sell.setAttribute("minimum-photos", "6");
        sell.setAttribute("maximum-photos", "6");
        const authored = sell as unknown as { applyCopy(): void };
        authored.applyCopy();

        expect(sell.shadowRoot?.querySelector('[data-copy="stepProduct"]')?.textContent).toBe("Choose a product");
        expect(sell.shadowRoot?.querySelector('[data-copy="submit"]')?.textContent).toBe("Submit the offer");
        expect(sell.shadowRoot?.querySelector("#product-search")?.getAttribute("label")).toBe("Product model");
        expect(sell.getAttribute("locale")).toBeNull();
        expect(sell.shadowRoot?.querySelector("[data-photo-hint]")?.textContent).toBe(
            "Choose 6 images. Supported images, up to 5 MiB each.",
        );
        sell.querySelector('[slot="copy-photo-formats"]')?.remove();
        authored.applyCopy();
        expect(sell.shadowRoot?.querySelector("[data-photo-hint]")?.textContent).toBe(
            "Choose 6 images. JPEG, PNG, WebP, or AVIF, up to 5 MB per image.",
        );
    });

    test("uses the default photo bounds when attributes are absent", () => {
        if (!customElements.get(TAG)) {
            customElements.define(TAG, SellBloc);
        }
        const sell = document.createElement(TAG) as SellBloc;
        const policy = sell as unknown as {
            maximumPhotos: number;
            minimumPhotos: number;
        };

        expect(policy.minimumPhotos).toBe(3);
        expect(policy.maximumPhotos).toBe(5);
    });

    test("keeps an explicit zero-photo policy", () => {
        const sell = document.createElement(TAG) as SellBloc;
        sell.setAttribute("minimum-photos", "0");
        sell.setAttribute("maximum-photos", "0");
        const policy = sell as unknown as {
            maximumPhotos: number;
            minimumPhotos: number;
        };

        expect(policy.minimumPhotos).toBe(0);
        expect(policy.maximumPhotos).toBe(0);
    });
});
