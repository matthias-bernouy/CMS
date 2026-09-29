import { afterEach, describe, expect, test } from "bun:test";
import { Bloc } from "../../../blocs/domains/commerce/selling/sell/Bloc";
import defaultMarkup from "../../../blocs/domains/commerce/selling/sell/default.html" with { type: "text" };

if (!customElements.get("mossa-sell")) {
    customElements.define("mossa-sell", Bloc);
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("Mossa seller photo step", () => {
    test("uses Commerce policy and keeps Continue disabled until four valid photos are selected", async () => {
        const bloc = new Bloc();
        const sample = document.createElement("div");
        sample.innerHTML = defaultMarkup as unknown as string;
        bloc.innerHTML = sample.firstElementChild!.innerHTML;
        bloc.setAttribute("minimum-photos", "1");
        bloc.setAttribute("maximum-photos", "2");
        (bloc as any).requestSource = async (id: string) =>
            id === "sell-conditions"
                ? { items: [{ code: "good", label: "Good" }], photoPolicy: { minimum: 4, maximum: 5 } }
                : {};
        document.body.append(bloc);
        await Bun.sleep(0);

        const root = bloc.shadowRoot!;
        const upload = root.querySelector<HTMLInputElement>(".photos-upload")!;
        const continueButton = root.querySelector<HTMLButtonElement>('[data-next="4"]')!;
        const error = root.querySelector<HTMLElement>('[data-step-error="3"]')!;
        expect(continueButton.disabled).toBe(true);
        expect(error.textContent).toBe("Add between 4 and 5 photos.");
        expect(root.querySelector<HTMLElement>(".photo-field")!.hasAttribute("data-invalid")).toBe(true);

        const files = Array.from({ length: 4 }, (_, index) => new File(["png"], `${index}.png`, { type: "image/png" }));
        Object.defineProperty(upload, "files", { configurable: true, value: files });
        upload.dispatchEvent(new Event("change"));
        expect(continueButton.disabled).toBe(false);
        expect(error.hidden).toBe(true);

        root.querySelectorAll<HTMLButtonElement>(".remove-photo")[0]!.click();
        expect(continueButton.disabled).toBe(true);
        expect(error.hidden).toBe(false);

        Object.defineProperty(upload, "files", {
            configurable: true,
            value: [new File(["heic"], "phone.heic")],
        });
        upload.dispatchEvent(new Event("change"));
        expect(continueButton.disabled).toBe(false);

        Object.defineProperty(upload, "files", {
            configurable: true,
            value: Array.from({ length: 3 }, (_, index) => new File(["heif"], `${index}.heif`, { type: "image/heif" })),
        });
        upload.dispatchEvent(new Event("change"));
        expect(root.querySelectorAll(".photo-preview")).toHaveLength(5);
        expect(error.textContent).toBe("Maximum of 5 photos reached.");
    });
});
