const CLIENTS_CHANGED_EVENT = "sales-clients:changed";
const CLIENT_ID = /^[1-9][0-9]*$/;

export class SalesClientDirectory extends HTMLElement {
    static observedAttributes = ["client-limit", "source-id", "source-prefix"];

    observer = null;
    dialogOpeners = new WeakMap();
    detailOpener = null;
    selectedClientId = null;
    syncQueued = false;

    connectedCallback() {
        this.addEventListener("click", this.onClick);
        this.addEventListener("cancel", this.onCancel, true);
        this.addEventListener("cms-source:success", this.onSourceSuccess);
        this.observer = new MutationObserver(() => this.queueSync());
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("cancel", this.onCancel, true);
        this.removeEventListener("cms-source:success", this.onSourceSuccess);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    onClick = (event) => {
        const close = eventTargetWithin(this, event, "[data-sales-client-dialog-close]");
        if (close) {
            event.preventDefault();
            const dialog = close.closest("dialog");
            if (dialog) {
                this.dismissDialog(dialog);
            }
            return;
        }
        const create = eventTargetWithin(this, event, "[data-sales-client-create-open]");
        if (create) {
            event.preventDefault();
            const dialog = this.querySelector("[data-sales-client-create-dialog]");
            if (dialog) {
                this.showDialog(dialog, create, '[name="companyName"]');
            }
            return;
        }
        const button = eventTargetWithin(this, event, "[data-sales-client-open]");
        if (!button) {
            return;
        }
        const id = safeClientId(button.getAttribute("data-client-id"));
        if (!id) {
            return;
        }
        event.preventDefault();
        this.detailOpener = button;
        this.selectedClientId = id;
        this.syncDetail();
    };

    onCancel = (event) => {
        const dialog = event.target instanceof Element ? event.target.closest("dialog") : null;
        if (!dialog || !this.contains(dialog)) {
            return;
        }
        if (dialog.matches("[data-sales-client-edit-dialog]")) {
            this.selectedClientId = null;
        }
        queueMicrotask(() => {
            this.syncDetail();
            this.restoreDialogFocus(dialog);
        });
    };

    onSourceSuccess = (event) => {
        const form = event.target instanceof Element ? event.target.closest("form") : null;
        if (
            !form ||
            !this.contains(form) ||
            !form.matches("[data-sales-client-create-form], [data-sales-client-edit-form]")
        ) {
            return;
        }
        const dialog = form.closest("dialog");
        if (dialog) {
            this.dismissDialog(dialog);
        }
    };

    queueSync() {
        if (this.syncQueued) {
            return;
        }
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (this.isConnected) {
                this.sync();
            }
        });
    }

    sync() {
        const base = sourceBase(this);
        const limit = positiveInteger(this.getAttribute("client-limit"), 100, 100);
        setAttributeIfChanged(this, "cms-source", `${base}/listMyClients?limit=${limit} as clientsData`);
        setAttributeIfChanged(this, "cms-reload-on", CLIENTS_CHANGED_EVENT);
        configureForm(
            this.querySelector("[data-sales-client-create-form]"),
            `${base}/saveMyClient as clientResult`,
            true,
        );
        this.syncDetail(base);
    }

    syncDetail(base = sourceBase(this)) {
        const placeholder = this.querySelector("[data-sales-client-detail-placeholder]");
        const selectedId = this.selectedClientId;

        if (placeholder) {
            placeholder.toggleAttribute("hidden", Boolean(selectedId));
        }
        for (const button of this.querySelectorAll("[data-sales-client-open]")) {
            const selected = safeClientId(button.getAttribute("data-client-id")) === selectedId;
            button.setAttribute("aria-pressed", String(selected));
            if (selected) {
                this.detailOpener = button;
            }
        }
        const mount = this.querySelector("[data-sales-client-detail-mount]");
        if (!mount) {
            return;
        }
        if (!selectedId) {
            if (mount.childNodes.length > 0) {
                mount.replaceChildren();
            }
            return;
        }

        const source = `${base}/getMyClient?id=${encodeURIComponent(selectedId)} as clientData`;
        const current = mount.querySelector("[data-sales-client-detail-source]");
        if (
            current?.getAttribute("data-sales-client-detail-id") === selectedId &&
            current.getAttribute("cms-source") === source
        ) {
            configureForm(
                current.querySelector("[data-sales-client-edit-form]"),
                `${base}/saveMyClient as clientResult`,
                false,
            );
            this.showDialog(current, this.detailOpener, '[name="companyName"]');
            return;
        }

        const template = this.querySelector("[data-sales-client-detail-template]");
        if (!template?.content) {
            return;
        }
        const content = template.content.cloneNode(true);
        const detail = content.querySelector("[data-sales-client-detail-source]");
        if (!detail) {
            return;
        }
        detail.setAttribute("data-sales-client-detail-id", selectedId);
        detail.setAttribute("cms-source", source);
        detail.setAttribute("cms-reload-on", CLIENTS_CHANGED_EVENT);
        configureForm(
            detail.querySelector("[data-sales-client-edit-form]"),
            `${base}/saveMyClient as clientResult`,
            false,
        );
        mount.replaceChildren(content);
        this.showDialog(detail, this.detailOpener, '[name="companyName"]');
    }

    showDialog(dialog, opener, focusSelector) {
        if (opener) {
            this.dialogOpeners.set(dialog, opener);
        }
        const wasOpen = dialog.open || dialog.hasAttribute("open");
        if (!wasOpen) {
            dialog.removeAttribute("data-sales-client-dialog-focused");
            try {
                if (typeof dialog.showModal === "function") {
                    dialog.showModal();
                } else {
                    dialog.setAttribute("open", "");
                }
            } catch {
                dialog.setAttribute("open", "");
            }
        }
        if (dialog.hasAttribute("data-sales-client-dialog-focused")) {
            return;
        }
        queueMicrotask(() => {
            const target = dialog.querySelector(focusSelector);
            if ((dialog.open || dialog.hasAttribute("open")) && target && dialogTargetIsReady(dialog)) {
                target.focus();
                dialog.setAttribute("data-sales-client-dialog-focused", "");
            }
        });
    }

    dismissDialog(dialog) {
        if (dialog.matches("[data-sales-client-edit-dialog]")) {
            this.selectedClientId = null;
        }
        try {
            if (typeof dialog.close === "function" && (dialog.open || dialog.hasAttribute("open"))) {
                dialog.close();
            } else {
                dialog.removeAttribute("open");
            }
        } catch {
            dialog.removeAttribute("open");
        }
        this.syncDetail();
        this.restoreDialogFocus(dialog);
    }

    restoreDialogFocus(dialog) {
        const opener = this.dialogOpeners.get(dialog);
        if (opener?.isConnected) {
            opener.focus();
        }
    }
}

function configureForm(element, source, resetAfterSuccess) {
    if (!element) {
        return;
    }
    setAttributeIfChanged(element, "cms-source", source);
    setAttributeIfChanged(element, "cms-source-trigger", "submit");
    setAttributeIfChanged(element, "cms-source-method", "POST");
    setAttributeIfChanged(element, "cms-source-success-reset", String(resetAfterSuccess));
    setAttributeIfChanged(element, "cms-source-publish", CLIENTS_CHANGED_EVENT);
}

function sourceBase(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const id = encodeURIComponent(host.getAttribute("source-id")?.trim() || "sales-configurator");
    return `${prefix}/${id}`;
}

function positiveInteger(value, fallback, maximum) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function safeClientId(value) {
    const candidate = value?.trim() || "";
    return CLIENT_ID.test(candidate) ? candidate : null;
}

function dialogTargetIsReady(dialog) {
    const editForm = dialog.querySelector("[data-sales-client-edit-form]");
    if (!editForm) {
        return true;
    }
    const id = editForm.querySelector('[name="id"]')?.getAttribute("value");
    return Boolean(safeClientId(id));
}

function eventTargetWithin(host, event, selector) {
    for (const candidate of event.composedPath()) {
        if (candidate instanceof Element && host.contains(candidate)) {
            const match = candidate.closest(selector);
            if (match && host.contains(match)) {
                return match;
            }
        }
    }
    return null;
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesClientDirectory);
