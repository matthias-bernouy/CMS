import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const tag = "test-mossa-mondial-relay-picker-validation";

type TestPicker = HTMLElement & {
    relayPointsPath(): string;
    search(): Promise<void>;
    requestJson(url: URL): Promise<{ items: unknown[] }>;
};

describe("mossa-mondial-relay-picker 1.0.0", () => {
    test("owns postal-code validation across prefill, input, and search", async () => {
        if (!customElements.get(tag)) {
            await definePicker();
        }

        const picker = document.createElement(tag) as TestPicker;
        picker.setAttribute("country", "FR");
        document.body.append(picker);

        try {
            const input = picker.shadowRoot?.querySelector<HTMLInputElement>("[name='postalCode']");
            expect(input).not.toBeNull();
            if (!input) {
                throw new Error("expected the picker postal-code input");
            }

            expect(input.value).toBe("");
            expect(input.validationMessage).toBe("Postal code is required.");

            input.setCustomValidity("This field is required.");
            picker.setAttribute("postal-code", "75001");
            expect(input.value).toBe("75001");
            expect(input.validationMessage).toBe("");

            let requestedUrl: URL | undefined;
            picker.requestJson = async (url) => {
                requestedUrl = new URL(url);
                return { items: [] };
            };

            input.setCustomValidity("This field is required.");
            await picker.search();
            expect(input.validationMessage).toBe("");
            expect(requestedUrl?.searchParams.get("postalCode")).toBe("75001");

            picker.setAttribute("postal-code", "");
            expect(input.value).toBe("");
            expect(input.validationMessage).toBe("Postal code is required.");

            requestedUrl = undefined;
            await picker.search();
            expect(requestedUrl).toBeUndefined();

            input.value = "69001";
            input.setCustomValidity("Stale error");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            expect(input.validationMessage).toBe("");

            input.value = "   ";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            expect(input.validationMessage).toBe("Postal code is required.");
        } finally {
            picker.remove();
        }
    });

    test("automatically searches one prefilled address and exposes distinct secondary actions", async () => {
        if (!customElements.get(tag)) {
            await definePicker();
        }

        const picker = document.createElement(tag) as TestPicker;
        picker.setAttribute("country", "FR");
        picker.setAttribute("postal-code", "76930");
        picker.setAttribute("city", "Octeville-sur-Mer");
        const requestedUrls: URL[] = [];
        picker.requestJson = async (url) => {
            requestedUrls.push(new URL(url));
            return {
                items: [
                    {
                        location: "FR-024474",
                        name: "Coccimarket Bois de Bléville",
                        addressLine1: "21 rue des Ponts",
                        postalCode: "76620",
                        city: "Le Havre",
                        country: "FR",
                    },
                ],
            };
        };
        document.body.append(picker);

        try {
            await settleLifecycle();
            expect(requestedUrls).toHaveLength(1);
            expect(requestedUrls[0]?.searchParams.get("postalCode")).toBe("76930");
            expect(requestedUrls[0]?.searchParams.get("city")).toBe("Octeville-sur-Mer");
            expect(picker.shadowRoot?.querySelector("[data-search]")?.textContent).toBe("Search");
            expect(picker.shadowRoot?.querySelector(".choose")?.textContent).toBe("Select");
            expect(picker.shadowRoot?.querySelector("[data-clear]")?.textContent).toBe("Change");
            expect(picker.shadowRoot?.querySelector("[data-clear]")?.classList.contains("secondary")).toBe(true);

            picker.setAttribute("postal-code", "76931");
            picker.setAttribute("city", "Montivilliers");
            await settleLifecycle();
            expect(requestedUrls).toHaveLength(2);
            expect(requestedUrls[1]?.searchParams.get("postalCode")).toBe("76931");
            expect(requestedUrls[1]?.searchParams.get("city")).toBe("Montivilliers");
        } finally {
            picker.remove();
        }
    });

    test("accepts only one safe delivery installation-id segment", async () => {
        if (!customElements.get(tag)) {
            await definePicker();
        }

        const picker = document.createElement(tag) as TestPicker;
        expect(picker.relayPointsPath()).toBe("/.cms/sources/delivery/relayPoints");

        picker.setAttribute("source-id", "customer-delivery");
        expect(picker.relayPointsPath()).toBe("/.cms/sources/customer-delivery/relayPoints");

        for (const invalid of ["../delivery", "delivery/other", "Delivery", "delivery?endpoint=other"]) {
            picker.setAttribute("source-id", invalid);
            expect(() => picker.relayPointsPath()).toThrow("must be one URL path segment");
        }
    });
});

async function definePicker(): Promise<void> {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-mondial-relay-picker",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("mossa-mondial-relay-picker source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Mondial Relay",
        artifact.bloc.description ?? "",
        tag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}

async function settleLifecycle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}
