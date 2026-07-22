export class PhotoAlbumView {
    readonly slot: HTMLSlotElement;
    readonly album: HTMLElement;
    readonly legendAlbum: HTMLElement;
    readonly preview: HTMLElement;
    readonly previewImage: HTMLImageElement;
    readonly caption: HTMLElement;
    readonly strip: HTMLElement;
    readonly closeButton: HTMLButtonElement;
    readonly previousButton: HTMLButtonElement;
    readonly nextButton: HTMLButtonElement;

    constructor(root: ShadowRoot) {
        this.slot = root.querySelector<HTMLSlotElement>('slot[name="images"]')!;
        this.album = root.querySelector<HTMLElement>(".album")!;
        this.legendAlbum = root.querySelector<HTMLElement>(".legend-album")!;
        this.preview = root.querySelector<HTMLElement>(".preview")!;
        this.previewImage = root.querySelector<HTMLImageElement>(".preview-image")!;
        this.caption = root.querySelector<HTMLElement>(".preview-caption")!;
        this.strip = root.querySelector<HTMLElement>(".preview-strip")!;
        this.closeButton = root.querySelector<HTMLButtonElement>(".preview-close")!;
        this.previousButton = root.querySelector<HTMLButtonElement>(".preview-prev")!;
        this.nextButton = root.querySelector<HTMLButtonElement>(".preview-next")!;
    }

    images(): HTMLImageElement[] {
        return this.slot
            .assignedElements({ flatten: true })
            .filter((element): element is HTMLImageElement => element instanceof HTMLImageElement);
    }

    syncAlbum(images: HTMLImageElement[], showLegend: boolean): void {
        this.album.hidden = showLegend;
        this.legendAlbum.hidden = !showLegend;
        this.legendAlbum.replaceChildren(...(showLegend ? images.map(createFigure) : []));
    }

    showActive(images: HTMLImageElement[], index: number, showLegend: boolean): void {
        const source = images[index]!;
        this.previewImage.src = source.currentSrc || source.src;
        this.previewImage.alt = source.alt;
        this.caption.textContent = source.alt;
        this.caption.hidden = !showLegend || source.alt.trim() === "";
        this.previousButton.hidden = images.length < 2;
        this.nextButton.hidden = images.length < 2;
        this.syncStrip(images, index);
    }

    private syncStrip(images: HTMLImageElement[], activeIndex: number): void {
        const buttons = images.map((source, index) => {
            const button = document.createElement("button");
            button.className = "preview-thumb";
            button.type = "button";
            button.dataset.previewIndex = String(index);
            button.ariaSelected = index === activeIndex ? "true" : "false";
            button.setAttribute("role", "option");
            button.ariaLabel = source.alt.trim() || `Image ${index + 1}`;

            const image = document.createElement("img");
            image.src = source.currentSrc || source.src;
            image.alt = "";
            image.loading = source.loading || "lazy";
            button.append(image);
            return button;
        });
        this.strip.replaceChildren(...buttons);
        this.strip.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.scrollIntoView({
            block: "nearest",
            inline: "center",
        });
    }
}

function createFigure(source: HTMLImageElement, index: number): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = "figure";
    figure.setAttribute("part", "figure");

    const trigger = document.createElement("button");
    trigger.className = "figure-trigger";
    trigger.type = "button";
    trigger.dataset.previewIndex = String(index);
    trigger.ariaLabel = source.alt.trim() || "Open image";

    const image = document.createElement("img");
    image.src = source.currentSrc || source.src;
    image.alt = source.alt;
    image.loading = source.loading || "lazy";
    if (source.width > 0) {
        image.width = source.width;
    }
    if (source.height > 0) {
        image.height = source.height;
    }

    const caption = document.createElement("figcaption");
    caption.setAttribute("part", "legend");
    caption.textContent = source.alt;
    caption.hidden = source.alt.trim() === "";
    trigger.append(image);
    figure.append(trigger, caption);
    return figure;
}
