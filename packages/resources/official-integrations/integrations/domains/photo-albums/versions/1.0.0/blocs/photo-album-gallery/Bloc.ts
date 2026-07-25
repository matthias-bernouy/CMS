function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

export class PhotoAlbumGallery extends HTMLElement {
    static observedAttributes = [
        "grid-gap",
        "grid-max",
        "grid-min",
        "slug",
        "slug-param",
        "source-id",
        "source-prefix",
    ];

    connectedCallback() {
        this.style.display = "contents";
        this.ownerDocument.defaultView?.addEventListener("popstate", this.sync);
        this.sync();
    }

    disconnectedCallback() {
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.sync);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync = () => {
        const slug = this.albumSlug();
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "photo-albums");
        if (slug) {
            const params = new URLSearchParams({ slug });
            this.setAttribute("cms-source", `${prefix}/${sourceId}/album?${params.toString()} as data`);
        } else {
            this.removeAttribute("cms-source");
        }
        for (const grid of this.querySelectorAll("[data-photo-grid]")) {
            setAttributeIfChanged(grid, "min", this.getAttribute("grid-min") || "sm");
            setAttributeIfChanged(grid, "max", this.getAttribute("grid-max") || "none");
            setAttributeIfChanged(grid, "gap", this.getAttribute("grid-gap") || "sm");
        }
    };

    albumSlug() {
        const fixed = this.getAttribute("slug")?.trim();
        if (fixed) {
            return fixed;
        }
        if (typeof location === "undefined") {
            return "";
        }
        const param = this.getAttribute("slug-param")?.trim() || "slug";
        return new URLSearchParams(location.search).get(param)?.trim() || "";
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", PhotoAlbumGallery);
