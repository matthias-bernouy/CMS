import { afterEach, expect, test } from "bun:test";
import "cms-control/components";

afterEach(() => document.body.replaceChildren());

test("page indexing settings serialize an explicit Gateway sitemap projection", async () => {
    const form = document.createElement("form");
    const indexing = document.createElement("cms-page-indexing-settings");
    indexing.setAttribute(
        "value",
        JSON.stringify({
            configured: false,
            suggested: true,
            detectionStatus: "detected",
            enabled: true,
            selection: "commerce|product.get|slug|product",
            selectionValid: true,
            availableVariables: [],
            candidates: [
                {
                    value: "commerce|product.get|slug|product",
                    label: "Product",
                    variables: [],
                    suggestedTitle: "",
                    suggestedDescription: "",
                },
            ],
            discoverOptions: [{ value: "commerce|product.list", label: "Commerce · List products" }],
        }),
    );
    form.append(indexing);
    document.body.append(form);
    await waitFor(() => indexing.shadowRoot?.querySelector('[data-projection="discoverCapability"]') !== null);

    const set = (name: string, value: string) => {
        const control = indexing.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(
            `[data-projection="${name}"]`,
        );
        expect(control).not.toBeNull();
        control!.value = value;
        control!.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("identityPath", "slug");
    set("discoverCapability", "commerce|product.list");
    set("itemsPath", "items");
    set("discoverIdentityPath", "slug");
    set("paginationType", "offset");

    const hidden = indexing.querySelector<HTMLInputElement>('[name="indexingProjection"]')!;
    expect(hidden.disabled).toBe(false);
    expect(JSON.parse(hidden.value)).toMatchObject({
        identityPath: "slug",
        discover: {
            capabilityId: "product.list",
            itemsPath: "items",
            identityPath: "slug",
            pagination: { type: "offset", limitParam: "limit", offsetParam: "offset", pageSize: 100 },
        },
    });
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Timed out waiting for page indexing settings");
}
