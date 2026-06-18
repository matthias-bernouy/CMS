import { describe, expect, test } from "bun:test";

import { PhotoAlbum } from "../src/ui/Media/PhotoAlbum/PhotoAlbum";

if (!customElements.get("p9r-photo-album-test")) customElements.define("p9r-photo-album-test", PhotoAlbum);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PhotoAlbum", () => {
    test("opens a large preview with thumbnail navigation from a slotted image", async () => {
        const album = document.createElement("p9r-photo-album-test") as PhotoAlbum;
        const first = document.createElement("img");
        first.slot = "images";
        first.src = "/first.jpg";
        first.alt = "First image";
        const second = document.createElement("img");
        second.slot = "images";
        second.src = "/second.jpg";
        second.alt = "Second image";
        album.append(first, second);
        document.body.append(album);

        await flush();
        first.click();

        const preview = album.shadowRoot!.querySelector<HTMLElement>(".preview")!;
        const previewImage = album.shadowRoot!.querySelector<HTMLImageElement>(".preview-image")!;
        const caption = album.shadowRoot!.querySelector<HTMLElement>(".preview-caption")!;
        expect(preview.hidden).toBe(false);
        expect(previewImage.src.endsWith("/first.jpg")).toBe(true);
        expect(caption.hidden).toBe(true);
        expect(caption.textContent).toBe("First image");
        expect(album.shadowRoot!.querySelectorAll(".preview-thumb")).toHaveLength(2);

        const secondThumb = album.shadowRoot!.querySelectorAll<HTMLButtonElement>(".preview-thumb")[1]!;
        secondThumb.click();

        expect(previewImage.src.endsWith("/second.jpg")).toBe(true);
        expect(caption.hidden).toBe(true);
        expect(caption.textContent).toBe("Second image");
    });

    test("keeps legend mode clickable", async () => {
        const album = document.createElement("p9r-photo-album-test") as PhotoAlbum;
        album.setAttribute("view-legend", "");
        const image = document.createElement("img");
        image.slot = "images";
        image.src = "/legend.jpg";
        image.alt = "Legend";
        album.append(image);
        document.body.append(album);

        await flush();
        album.shadowRoot!.querySelector<HTMLButtonElement>(".figure-trigger")!.click();

        expect(album.shadowRoot!.querySelector<HTMLElement>(".preview")!.hidden).toBe(false);
        expect(album.shadowRoot!.querySelector<HTMLImageElement>(".preview-image")!.src.endsWith("/legend.jpg")).toBe(true);
        expect(album.shadowRoot!.querySelector<HTMLElement>(".preview-caption")!.hidden).toBe(false);
        expect(album.shadowRoot!.querySelector<HTMLElement>(".preview-caption")!.textContent).toBe("Legend");
    });
});
