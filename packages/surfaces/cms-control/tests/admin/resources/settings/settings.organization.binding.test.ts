import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components";
import { json, resetSettingsTest, settingsHtml, waitFor } from "./settingsTestUtils";

afterEach(resetSettingsTest);

describe("admin organization settings binding", () => {
    test("renders organization values and activates its settings navigation item", async () => {
        globalThis.fetch = (async () =>
            json({
                site: {
                    organization: {
                        name: "Example",
                        legalName: "Example SAS",
                        description: "Site publisher",
                        logo: "/media/logo.svg",
                        email: "contact@example.com",
                        telephone: "+33123456789",
                        address: {
                            streetAddress: "10 Example Street",
                            postalCode: "75001",
                            addressLocality: "Paris",
                            addressRegion: "Île-de-France",
                            addressCountry: "FR",
                        },
                        sameAs: ["https://linkedin.com/company/example", "https://github.com/example"],
                    },
                },
            })) as unknown as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/organization");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/organization.html")}
            </cms-binding-core>
        `;

        await waitFor(() => document.querySelector("#organization-settings-form") !== null);

        expect(document.querySelector("p9r-input[name='site.organization.name']")?.getAttribute("value")).toBe(
            "Example",
        );
        expect(
            document
                .querySelector("p9r-input[name='site.organization.address.addressLocality']")
                ?.getAttribute("value"),
        ).toBe("Paris");
        const logo = document.querySelector<HTMLElement & { value: string }>(
            "cms-media-input[name='site.organization.logo']",
        )!;
        expect(logo.value).toBe("/media/logo.svg");
        expect(logo.shadowRoot!.querySelector(".tile")?.classList.contains("has-value")).toBe(true);
        expect(logo.shadowRoot!.querySelector("img")?.getAttribute("src")).toBe("/media/logo.svg");
        expect(document.querySelector("p9r-textarea[name='site.organization.sameAs']")?.getAttribute("value")).toBe(
            "https://linkedin.com/company/example\nhttps://github.com/example",
        );
        expect(document.querySelector("p9r-textarea[name='site.organization.sameAs']")?.getAttribute("hint")).toBe(
            "Enter one absolute public URL per line.",
        );
        expect(document.querySelectorAll("cms-form-save-action")).toHaveLength(2);
        expect(document.querySelectorAll("cms-detail-section[slot='main']")).toHaveLength(3);
        expect(document.querySelectorAll("cms-detail-section[slot='aside']")).toHaveLength(2);

        const navigation = document.querySelector("cms-settings-nav");
        const organization = navigation?.shadowRoot?.querySelector("[data-settings-section='organization']");
        expect(organization?.hasAttribute("active")).toBe(true);
    });

    test("tracks pristine, saving, failed, and saved form states", async () => {
        document.body.innerHTML = `
            <form id="organization-form"><input name="name"></form>
            <cms-form-save-action form="organization-form" label="Save organization"></cms-form-save-action>
        `;
        await Promise.resolve();

        const form = document.querySelector<HTMLFormElement>("#organization-form")!;
        const action = document.querySelector("cms-form-save-action")!;
        const button = action.shadowRoot!.querySelector<HTMLElement & { disabled: boolean }>("p9r-button")!;
        const status = action.shadowRoot!.querySelector<HTMLElement>("[data-status]")!;

        expect({ state: action.getAttribute("state"), disabled: button.disabled, label: status.textContent }).toEqual({
            state: "pristine",
            disabled: true,
            label: "Save organization",
        });

        form.dispatchEvent(new Event("input", { bubbles: true }));
        expect({ state: action.getAttribute("state"), disabled: button.disabled }).toEqual({
            state: "dirty",
            disabled: false,
        });

        form.dispatchEvent(new Event("submit"));
        expect({ state: action.getAttribute("state"), disabled: button.disabled, label: status.textContent }).toEqual({
            state: "saving",
            disabled: true,
            label: "Saving…",
        });

        form.dispatchEvent(new CustomEvent("cms-source:failed"));
        expect({ state: action.getAttribute("state"), disabled: button.disabled }).toEqual({
            state: "dirty",
            disabled: false,
        });

        form.dispatchEvent(new CustomEvent("cms-source:success"));
        expect({ state: action.getAttribute("state"), disabled: button.disabled, label: status.textContent }).toEqual({
            state: "saved",
            disabled: true,
            label: "Saved",
        });
    });
});
