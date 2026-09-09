import { syncResponsiveSourceImageElement } from "@bernouy/cms-source-images/browser";

const thumbnailSelector = '[slot="thumbnails"].offer-thumbnail';

export function installOfferGallery(host: HTMLElement, imageFit: () => string): () => void {
    const selectFromEvent = (event: Event): void => {
        const thumbnail =
            event.target instanceof Element ? event.target.closest<HTMLImageElement>(thumbnailSelector) : null;
        if (thumbnail) {
            selectThumbnail(host, thumbnail, imageFit());
        }
    };
    const selectFromKeyboard = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        const thumbnail =
            event.target instanceof Element ? event.target.closest<HTMLImageElement>(thumbnailSelector) : null;
        if (!thumbnail) {
            return;
        }
        event.preventDefault();
        selectThumbnail(host, thumbnail, imageFit());
    };
    host.addEventListener("click", selectFromEvent);
    host.addEventListener("keydown", selectFromKeyboard);
    return () => {
        host.removeEventListener("click", selectFromEvent);
        host.removeEventListener("keydown", selectFromKeyboard);
    };
}

function selectThumbnail(host: HTMLElement, thumbnail: HTMLImageElement, imageFit: string): void {
    const main = host.querySelector<HTMLImageElement>(".offer-main-image");
    if (!main) {
        return;
    }
    for (const attribute of ["data-cms-src", "data-source-width", "data-source-height"]) {
        const value = thumbnail.getAttribute(attribute);
        if (value) {
            main.setAttribute(attribute, value);
        }
    }
    main.alt = thumbnail.alt;
    main.style.objectFit = imageFit;
    syncResponsiveSourceImageElement(main);
    for (const image of host.querySelectorAll(thumbnailSelector)) {
        image.setAttribute("aria-current", image === thumbnail ? "true" : "false");
    }
}
