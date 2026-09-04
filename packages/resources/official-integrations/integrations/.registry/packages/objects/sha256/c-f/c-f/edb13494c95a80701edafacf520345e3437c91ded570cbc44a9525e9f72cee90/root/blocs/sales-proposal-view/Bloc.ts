const PARAM_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;

export class SalesProposalView extends HTMLElement {
    static observedAttributes = ["locale", "source-id", "source-prefix", "token-param"];

    observer = null;

    connectedCallback() {
        this.observer = new MutationObserver(() => this.syncPresentation());
        this.observer.observe(this, { childList: true, subtree: true });
        this.syncSource();
        this.syncPresentation();
    }

    disconnectedCallback() {
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncSource();
            this.syncPresentation();
        }
    }

    syncSource() {
        const token = parameterName(this.getAttribute("token-param"), "proposalToken");
        setAttributeIfChanged(this, "cms-source", `${sourceBase(this)}/getSharedProposal?token=#{${token}} as shared`);
    }

    syncPresentation() {
        for (const item of this.querySelectorAll("[data-sales-proposal-item]")) {
            const rawDepth = item.getAttribute("data-sales-depth")?.trim() ?? "";
            if (!rawDepth || rawDepth.includes("{{")) {
                continue;
            }
            const depth = Math.min(Math.max(Number.parseInt(rawDepth, 10) || 0, 0), 4);
            item.style.marginInlineStart = depth > 0 ? `${depth * 1.25}rem` : "";
            item.toggleAttribute("data-sales-child", depth > 0);
            item.setAttribute("aria-level", String(depth + 2));
        }
        formatMoney(this, this.getAttribute("locale") || this.ownerDocument.documentElement.lang || "en");
    }
}

function sourceBase(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const id = encodeURIComponent(host.getAttribute("source-id")?.trim() || "sales-configurator");
    return `${prefix}/${id}`;
}

function parameterName(value, fallback) {
    const candidate = value?.trim() || "";
    return PARAM_NAME.test(candidate) ? candidate : fallback;
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function formatMoney(root, locale) {
    for (const element of root.querySelectorAll("[data-sales-money]")) {
        const amount = element.getAttribute("data-amount-cents")?.trim() || "";
        const currency = element.getAttribute("data-currency")?.trim().toUpperCase() || "EUR";
        if (!amount || amount.includes("{{")) {
            continue;
        }
        const cents = Number(amount);
        if (Number.isFinite(cents)) {
            let formatted;
            try {
                formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
            } catch {
                formatted = `${(cents / 100).toFixed(2)} ${currency}`;
            }
            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesProposalView);
