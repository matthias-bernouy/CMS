function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function sourceBase(element) {
    const prefix = (element.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const sourceId = encodeURIComponent(element.getAttribute("source-id") || "photo-albums");
    return `${prefix}/${sourceId}`;
}

function syncBoundSourceUrl(element, base) {
    const endpoint = element.getAttribute("data-photo-source-url");
    if (!endpoint) {
        return;
    }
    const attribute =
        element.localName === "img" && element.hasAttribute("data-cms-src")
            ? "data-cms-src"
            : element.localName === "img"
              ? "src"
              : "href";
    const current = element.getAttribute(attribute) || "";
    const queryIndex = current.indexOf("?");
    const suffix = queryIndex >= 0 ? current.slice(queryIndex) : "";
    setAttributeIfChanged(element, attribute, `${base}/${endpoint}${suffix}`);
}

export class PhotoAlbumList extends HTMLElement {
    static observedAttributes = [
        "category",
        "grid-gap",
        "grid-max",
        "grid-min",
        "page-param",
        "page-size",
        "source-id",
        "source-prefix",
        "sync-url",
    ];

    page = 1;

    connectedCallback() {
        this.style.display = "contents";
        this.page = this.readPage();
        this.addEventListener("basic-pagination:change", this.onPageChange);
        this.ownerDocument.defaultView?.addEventListener("popstate", this.onPopState);
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("basic-pagination:change", this.onPageChange);
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.onPopState);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync() {
        const pageSize = positiveInteger(this.getAttribute("page-size"), 12);
        const params = new URLSearchParams({
            limit: String(pageSize),
            offset: String((this.page - 1) * pageSize),
        });
        const category = this.getAttribute("category")?.trim();
        if (category) {
            params.set("category", category);
        }
        const base = sourceBase(this);
        for (const element of this.querySelectorAll("[data-photo-source-url]")) {
            syncBoundSourceUrl(element, base);
        }
        this.setAttribute("cms-source", `${base}/albums?${params.toString()} as data`);
        for (const grid of this.querySelectorAll("[data-album-grid]")) {
            setAttributeIfChanged(grid, "min", this.getAttribute("grid-min") || "sm");
            setAttributeIfChanged(grid, "max", this.getAttribute("grid-max") || "lg");
            setAttributeIfChanged(grid, "gap", this.getAttribute("grid-gap") || "md");
        }
        for (const pagination of this.querySelectorAll("basic-pagination")) {
            setAttributeIfChanged(pagination, "page", String(this.page));
            setAttributeIfChanged(pagination, "page-size", String(pageSize));
        }
    }

    readPage() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined") {
            return 1;
        }
        const name = this.getAttribute("page-param")?.trim() || "page";
        return positiveInteger(new URLSearchParams(location.search).get(name), 1);
    }

    writePage() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined") {
            return;
        }
        const name = this.getAttribute("page-param")?.trim() || "page";
        const url = new URL(location.href);
        if (this.page <= 1) {
            url.searchParams.delete(name);
        } else {
            url.searchParams.set(name, String(this.page));
        }
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    onPageChange = (event) => {
        const page = positiveInteger(event.detail?.page, 1);
        this.page = page;
        this.writePage();
        this.sync();
    };

    onPopState = () => {
        const page = this.readPage();
        if (page !== this.page) {
            this.page = page;
            this.sync();
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", PhotoAlbumList);
