import { afterEach, describe, expect, test } from "bun:test";
import { Bloc } from "../../../blocs/domains/commerce/selling/sell/Bloc";
import defaultMarkup from "../../../blocs/domains/commerce/selling/sell/default.html" with { type: "text" };
import { uploadPhotoWithJpegFallback } from "../../../blocs/domains/commerce/selling/sell/photoUpload";

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

    test("retries an image rejected by Commerce after converting it to JPEG", async () => {
        const original = new File(["heic"], "phone.heic", { type: "image/heic" });
        const converted = new File(["jpeg"], "phone.jpg", { type: "image/jpeg" });
        const uploads: File[] = [];
        let conversions = 0;

        await uploadPhotoWithJpegFallback(
            original,
            async (file) => {
                uploads.push(file);
                if (file === original) {
                    throw Object.assign(new Error("file is not a valid supported image"), { status: 400 });
                }
            },
            async (file) => {
                conversions++;
                expect(file).toBe(original);
                return converted;
            },
        );

        expect(uploads).toEqual([original, converted]);
        expect(conversions).toBe(1);
    });

    test("keeps a successful original upload unchanged", async () => {
        const original = new File(["jpeg"], "phone.jpg", { type: "image/jpeg" });
        const uploads: File[] = [];
        let conversions = 0;

        await uploadPhotoWithJpegFallback(
            original,
            async (file) => {
                uploads.push(file);
            },
            async () => {
                conversions++;
                return original;
            },
        );

        expect(uploads).toEqual([original]);
        expect(conversions).toBe(0);
    });

    test("does not convert photos for unrelated upload failures", async () => {
        const original = new File(["heic"], "phone.heic", { type: "image/heic" });
        const error = Object.assign(new Error("unauthorized"), { status: 401 });
        let conversions = 0;

        await expect(
            uploadPhotoWithJpegFallback(
                original,
                async () => {
                    throw error;
                },
                async () => {
                    conversions++;
                    return original;
                },
            ),
        ).rejects.toBe(error);
        expect(conversions).toBe(0);
    });

    test("does not retry again when the converted upload fails", async () => {
        const original = new File(["heic"], "phone.heic", { type: "image/heic" });
        const converted = new File(["jpeg"], "phone.jpg", { type: "image/jpeg" });
        const retryError = Object.assign(new Error("file is not a valid supported image"), { status: 400 });
        let uploads = 0;

        await expect(
            uploadPhotoWithJpegFallback(
                original,
                async (file) => {
                    uploads++;
                    if (file === original) {
                        throw Object.assign(new Error("file is not a valid supported image"), { status: 400 });
                    }
                    throw retryError;
                },
                async () => converted,
            ),
        ).rejects.toBe(retryError);
        expect(uploads).toBe(2);
    });
});
