import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const tag = "test-mondial-relay-picker-validation";
const blocUrl = new URL(
    "../integrations/mondial-relay/versions/1.0.0/blocs/mondial-relay-picker/Bloc.ts",
    import.meta.url,
);

type TestPicker = HTMLElement & {
    search(): Promise<void>;
    requestJson(url: URL): Promise<{ items: unknown[] }>;
};

describe("mondial-relay-picker 1.0.0", () => {
    test("owns postal-code validation across prefill, input, and search", async () => {
        if (!customElements.get(tag)) {
            const source = readFileSync(blocUrl, "utf8").replaceAll("BE5_TAG_TO_BE_REPLACED", tag);
            new Function(source)();
        }

        const picker = document.createElement(tag) as TestPicker;
        document.body.append(picker);

        try {
            const input = picker.shadowRoot?.querySelector<HTMLInputElement>("[name='postalCode']");
            expect(input).not.toBeNull();
            if (!input) throw new Error("expected the picker postal-code input");

            expect(input.value).toBe("");
            expect(input.validationMessage).toBe("Le code postal est obligatoire.");

            input.setCustomValidity("Ce champ est obligatoire.");
            picker.setAttribute("postal-code", "75001");
            expect(input.value).toBe("75001");
            expect(input.validationMessage).toBe("");

            let requestedUrl: URL | undefined;
            picker.requestJson = async url => {
                requestedUrl = new URL(url);
                return { items: [] };
            };

            input.setCustomValidity("Ce champ est obligatoire.");
            await picker.search();
            expect(input.validationMessage).toBe("");
            expect(requestedUrl?.searchParams.get("postalCode")).toBe("75001");

            picker.setAttribute("postal-code", "");
            expect(input.value).toBe("");
            expect(input.validationMessage).toBe("Le code postal est obligatoire.");

            requestedUrl = undefined;
            await picker.search();
            expect(requestedUrl).toBeUndefined();

            input.value = "69001";
            input.setCustomValidity("Erreur obsolète");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            expect(input.validationMessage).toBe("");

            input.value = "   ";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            expect(input.validationMessage).toBe("Le code postal est obligatoire.");
        } finally {
            picker.remove();
        }
    });
});
