class BasicRedirect extends HTMLElement {
    static observedAttributes = ["page"];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.hasRedirected = false;
    }

    connectedCallback() {
        this.render();
        this.redirect();
    }

    attributeChangedCallback() {
        if (!this.isConnected) return;
        this.render();
        this.redirect();
    }

    render() {
        const page = this.getAttribute("page") || "";
        this.root.innerHTML = `
            <style>
                :host { display: none; }

                .preview {
                    padding: .75rem;
                    border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
                    border-radius: .375rem;
                    color: color-mix(in srgb, currentColor 70%, transparent);
                    font: inherit;
                }
            </style>
            <div class="preview" part="preview"></div>
            <a hidden></a>
        `;

        if (!isFramed()) return;
        this.style.display = "block";
        const preview = this.root.querySelector(".preview");
        preview.textContent = page ? `Redirection vers ${page}` : "Choisissez une page de redirection";
    }

    redirect() {
        if (isFramed() || this.hasRedirected) return;
        const page = this.getAttribute("page") || "";
        if (!isInternalPage(page)) return;
        const target = new URL(page, window.location.href);
        if (target.href === window.location.href) return;
        this.hasRedirected = true;
        const anchor = this.root.querySelector("a");
        anchor.href = target.href;
        anchor.click();
    }
}

function isInternalPage(value) {
    return value.startsWith("/") && !value.startsWith("//");
}

function isFramed() {
    try {
        return window.top !== window.self;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicRedirect);
