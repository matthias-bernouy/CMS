import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardWMediaField } from "../../../../src/components/admin/Resources/Dashboards/widgets/w-media-field/WMediaField";
import "../../../../src/components/admin/Resources/Dashboards/widgets/w-media-field/WMediaField";
import {
    W_MEDIA_FIELD_ACTION_EVENT,
    type DashboardMediaItem,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/w-media-field/types";

const items: DashboardMediaItem[] = [
    {
        id: "first",
        url: "/media/first.jpg",
        thumbnailUrl: "/thumbnails/first.avif",
        alt: "Front view",
        name: "First racket",
    },
    {
        id: "second",
        url: "/media/second.jpg",
        thumbnailUrl: "/thumbnails/second.avif",
        alt: "Side view",
        name: "Second racket",
    },
];

afterEach(() => {
    document.body.replaceChildren();
});

describe("dashboard media field preview", () => {
    test("opens originals and navigates without entering the edit flow", () => {
        const field = createField(items);
        const root = field.shadowRoot!;
        const trigger = root.querySelector<HTMLButtonElement>("[data-preview-open]")!;
        const fileInput = root.querySelector<HTMLInputElement>("[data-file]")!;
        let pickerClicks = 0;
        let mediaActions = 0;
        fileInput.click = () => {
            pickerClicks += 1;
        };
        field.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, () => {
            mediaActions += 1;
        });

        trigger.focus();
        trigger.click();

        const dialog = root.querySelector<HTMLDialogElement>("[data-preview-dialog]")!;
        const previewImage = root.querySelector<HTMLImageElement>("[data-preview-image]")!;
        expect(dialog.open).toBe(true);
        expect(previewImage.src.endsWith("/media/first.jpg")).toBe(true);
        expect(root.querySelector("[data-preview-caption]")?.textContent).toBe("First racket");
        expect(root.querySelector("[data-preview-counter]")?.textContent).toBe("1 / 2");
        expect(root.activeElement).toBe(root.querySelector("[data-preview-action='close']"));
        expect(root.querySelector<HTMLImageElement>(".preview-thumb img")?.src.endsWith("/thumbnails/first.avif")).toBe(
            true,
        );
        expect(root.querySelectorAll("img[src$='/media/second.jpg']")).toHaveLength(0);

        root.querySelector<HTMLButtonElement>("[data-preview-action='next']")!.click();
        expect(previewImage.src.endsWith("/media/second.jpg")).toBe(true);
        expect(root.querySelector("[data-preview-counter]")?.textContent).toBe("2 / 2");
        expect(root.querySelector<HTMLButtonElement>("[data-preview-index='1']")?.getAttribute("aria-current")).toBe(
            "true",
        );

        const firstThumbnail = root.querySelector<HTMLButtonElement>("[data-preview-index='0']")!;
        firstThumbnail.click();
        expect(previewImage.src.endsWith("/media/first.jpg")).toBe(true);
        expect(root.activeElement).toBe(root.querySelector("[data-preview-index='0']"));
        dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(previewImage.src.endsWith("/media/second.jpg")).toBe(true);
        expect(root.activeElement).toBe(root.querySelector("[data-preview-index='1']"));
        dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        expect(previewImage.src.endsWith("/media/second.jpg")).toBe(true);

        dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(dialog.open).toBe(false);
        expect(previewImage.hasAttribute("src")).toBe(false);
        expect(root.activeElement).toBe(trigger);
        expect(pickerClicks).toBe(0);
        expect(mediaActions).toBe(0);
    });

    test("tracks item changes and closes safely when the gallery becomes empty", () => {
        const field = createField([]);
        const root = field.shadowRoot!;
        const trigger = root.querySelector<HTMLButtonElement>("[data-preview-open]")!;
        expect(trigger.hidden).toBe(true);

        field.items = [items[0]!];
        expect(trigger.hidden).toBe(false);
        trigger.click();

        const dialog = root.querySelector<HTMLDialogElement>("[data-preview-dialog]")!;
        const previewImage = root.querySelector<HTMLImageElement>("[data-preview-image]")!;
        expect(dialog.open).toBe(true);
        expect(root.querySelector<HTMLButtonElement>("[data-preview-action='previous']")?.hidden).toBe(true);
        expect(root.querySelector<HTMLElement>("[data-preview-strip]")?.hidden).toBe(true);
        expect(root.querySelector("[data-preview-status]")?.textContent).toBe("Loading image…");

        previewImage.dispatchEvent(new Event("error"));
        expect(root.querySelector("[data-preview-status]")?.textContent).toBe("Unable to load this image.");

        field.items = [items[1]!];
        expect(previewImage.src.endsWith("/media/second.jpg")).toBe(true);
        expect(root.querySelector("[data-preview-caption]")?.textContent).toBe("Second racket");
        expect(root.querySelector("[data-preview-status]")?.textContent).toBe("Loading image…");

        field.items = [];
        expect(dialog.open).toBe(false);
        expect(trigger.hidden).toBe(true);
        expect(previewImage.hasAttribute("src")).toBe(false);
    });

    test("closes from both explicit and backdrop controls", () => {
        const field = createField(items);
        const root = field.shadowRoot!;
        const trigger = root.querySelector<HTMLButtonElement>("[data-preview-open]")!;
        const dialog = root.querySelector<HTMLDialogElement>("[data-preview-dialog]")!;

        trigger.click();
        root.querySelector<HTMLButtonElement>("[data-preview-action='close']")!.click();
        expect(dialog.open).toBe(false);
        expect(root.activeElement).toBe(trigger);

        trigger.click();
        dialog.click();
        expect(dialog.open).toBe(false);
        expect(root.activeElement).toBe(trigger);
    });
});

function createField(value: DashboardMediaItem[]): DashboardWMediaField {
    const field = document.createElement("cms-dashboard-w-media-field") as DashboardWMediaField;
    field.setAttribute("label", "Images");
    field.items = value;
    document.body.append(field);
    return field;
}
