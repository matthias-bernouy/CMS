const MEDIA_ATTRIBUTES = ["src", "srcset", "sizes", "alt", "data-position"];
const THUMBNAIL_SELECTOR = 'img[slot^="gallery"]';

export class RestaurantCarouselController {
    constructor(host) {
        this.host = host;
        this.activeThumbnail = undefined;
        this.connected = false;
        this.cursor = 0;
        this.observer = undefined;
        this.progress = undefined;
        this.timer = undefined;
    }

    connect() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.host.addEventListener("click", this.onClick);
        this.host.addEventListener("keydown", this.onKeydown);
        this.observer = new MutationObserver(() => this.restart());
        this.observer.observe(this.host, { childList: true });
        this.restart();
    }

    disconnect() {
        this.connected = false;
        this.host.removeEventListener("click", this.onClick);
        this.host.removeEventListener("keydown", this.onKeydown);
        this.observer?.disconnect();
        this.stop();
    }

    restart() {
        this.stop();
        const thumbnails = this.thumbnails();
        if (!this.activeThumbnail || !thumbnails.includes(this.activeThumbnail)) {
            const currentSource = this.mainImage()?.getAttribute("src");
            this.activeThumbnail = thumbnails.find((image) => image.getAttribute("src") === currentSource);
        }
        this.prepare(thumbnails);
        if (!this.autoplayEnabled() || !thumbnails.length) {
            return;
        }

        const duration = this.duration();
        const bar = this.host.shadowRoot?.querySelector('[part="progress-value"]');
        if (bar) {
            this.progress = bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
                duration,
                easing: "linear",
                fill: "forwards",
            });
        }
        this.timer = setTimeout(() => this.advance(), duration);
    }

    advance() {
        const thumbnails = this.thumbnails();
        if (!thumbnails.length) {
            return;
        }
        const index = this.cursor % thumbnails.length;
        this.swap(thumbnails[index]);
        this.cursor = (index + 1) % thumbnails.length;
        this.restart();
    }

    autoplayEnabled() {
        const view = this.host.ownerDocument.defaultView;
        return (
            this.host.getAttribute("autoplay") !== "off" &&
            !view?.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }

    duration() {
        const seconds = Number.parseFloat(this.host.getAttribute("rotation-interval") || "5");
        return Math.min(10, Math.max(5, Number.isFinite(seconds) ? seconds : 5)) * 1000;
    }

    mainImage() {
        return this.host.querySelector('img[slot="media"]');
    }

    onClick = (event) => {
        this.select(event.target);
    };

    onKeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        if (this.select(event.target)) {
            event.preventDefault();
        }
    };

    prepare(thumbnails) {
        for (const image of thumbnails) {
            image.setAttribute("role", "button");
            image.tabIndex = 0;
            image.setAttribute("aria-label", `Show ${image.alt || "restaurant photograph"}`);
            image.setAttribute("aria-pressed", String(image === this.activeThumbnail));
        }
    }

    select(target) {
        if (!(target instanceof HTMLImageElement) || !target.matches(THUMBNAIL_SELECTOR)) {
            return false;
        }
        const thumbnails = this.thumbnails();
        const index = thumbnails.indexOf(target);
        if (index < 0) {
            return false;
        }
        this.swap(target);
        this.cursor = (index + 1) % thumbnails.length;
        this.restart();
        return true;
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.progress?.cancel();
        this.progress = undefined;
        const bar = this.host.shadowRoot?.querySelector('[part="progress-value"]');
        if (bar) {
            bar.style.transform = "scaleX(0)";
        }
    }

    swap(thumbnail) {
        const main = this.mainImage();
        if (!main) {
            return;
        }
        const thumbnailValues = MEDIA_ATTRIBUTES.map((attribute) => thumbnail.getAttribute(attribute));

        MEDIA_ATTRIBUTES.forEach((attribute, index) => {
            this.apply(main, attribute, thumbnailValues[index]);
        });
        main.setAttribute("loading", "eager");
        main.setAttribute("fetchpriority", "high");
        this.activeThumbnail = thumbnail;
        this.prepare(this.thumbnails());

        if (!this.host.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            main.animate(
                [
                    { opacity: 0.2, transform: "scale(1.025)" },
                    { opacity: 1, transform: "scale(1)" },
                ],
                { duration: 620, easing: "cubic-bezier(.22, 1, .36, 1)" },
            );
            this.centerThumbnail(thumbnail);
        }
    }

    thumbnails() {
        return Array.from(this.host.querySelectorAll(THUMBNAIL_SELECTOR));
    }

    centerThumbnail(thumbnail) {
        const scroller = thumbnail.assignedSlot?.closest('[part="rail"], [part="gallery"]');
        if (scroller && scroller.scrollWidth > scroller.clientWidth) {
            const scrollerBounds = scroller.getBoundingClientRect();
            const thumbnailBounds = thumbnail.getBoundingClientRect();
            const offset = thumbnailBounds.left - scrollerBounds.left;
            const centered = scroller.scrollLeft + offset - (scroller.clientWidth - thumbnailBounds.width) / 2;
            scroller.scrollTo({ left: centered, behavior: "smooth" });
        }
    }

    apply(element, attribute, value) {
        if (value === null) {
            element.removeAttribute(attribute);
        } else {
            element.setAttribute(attribute, value);
        }
    }
}
