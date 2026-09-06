import { filterControls, filterableFields } from "./schema-helpers";
import { loadSchema, schemaSourceUrl } from "./schema-loader";
import { prepareSchemaFilterParams } from "./schema-params";
import { renderSchema, renderSchemaState } from "./render-schema";

export class SchemaOfferFilters {
    constructor(host) {
        this.host = host;
        this.category = "";
        this.schema = null;
        this.controller = null;
        this.scheduled = false;
        this.inFlight = null;
        this.connected = false;
        this.scheduleTimer = null;
    }

    connect() {
        if (this.connected) {
            this.schedule();
            return;
        }
        this.connected = true;
        if (!this.schema) {
            this.host.setAttribute("data-schema-status", "pending");
        }
        this.host.ownerDocument.addEventListener("cms-params:change", this.schedule);
        this.host.ownerDocument.defaultView?.addEventListener("popstate", this.schedule);
        this.schedule();
    }

    disconnect() {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.host.ownerDocument.removeEventListener("cms-params:change", this.schedule);
        this.host.ownerDocument.defaultView?.removeEventListener("popstate", this.schedule);
        this.controller?.abort();
        this.controller = null;
        this.inFlight = null;
        this.scheduled = false;
        if (this.scheduleTimer) {
            clearTimeout(this.scheduleTimer);
            this.scheduleTimer = null;
        }
    }

    invalidate() {
        this.controller?.abort();
        this.inFlight = null;
        this.category = "";
        this.schema = null;
        this.host.setAttribute("data-schema-status", "pending");
        this.schedule();
    }

    render() {
        if (this.schema) {
            renderSchema(this.host, this.schema);
        }
    }

    renderCurrent() {
        if (this.schema && this.category === this.currentCategory()) {
            this.render();
        }
    }

    schedule = () => {
        if (this.scheduled) {
            return;
        }
        this.scheduled = true;
        this.scheduleTimer = setTimeout(() => {
            this.scheduled = false;
            this.scheduleTimer = null;
            if (this.host.isConnected) {
                void this.sync();
            }
        }, 0);
    };

    async sync() {
        const category = this.currentCategory();
        if (!category) {
            if (this.category) {
                this.clearManagedParams();
            }
            this.controller?.abort();
            this.category = "";
            this.schema = null;
            this.host.removeAttribute("data-schema-category");
            renderSchemaState(this.host, "idle");
            return;
        }
        if (category === this.category && this.schema) {
            return;
        }
        if (this.category && category !== this.category) {
            this.clearManagedParams();
        }
        this.category = category;
        if (this.inFlight?.category === category) {
            return this.inFlight.promise;
        }
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        renderSchemaState(this.host, "loading");
        const promise = this.load(category, controller);
        this.inFlight = { category, promise };
        try {
            await promise;
        } finally {
            if (this.inFlight?.promise === promise) {
                this.inFlight = null;
            }
        }
    }

    managedParams() {
        const fields = filterableFields(this.schema);
        return [
            ...(this.host.getAttribute("show-brand") === "false" ? [] : ["brand"]),
            ...fields.flatMap((field) => filterControls(field).map((control) => control.param)),
        ];
    }

    async load(category, controller) {
        try {
            const url = new URL(schemaSourceUrl(this.host), this.host.ownerDocument.baseURI);
            url.searchParams.set("category", category);
            const body = await loadSchema(url);
            if (controller.signal.aborted || !this.host.isConnected || category !== this.category) {
                return;
            }
            prepareSchemaFilterParams(this.host, body);
            this.schema = body;
            renderSchema(this.host, body);
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }
            console.error(error);
            this.schema = null;
            renderSchemaState(
                this.host,
                "error",
                this.host.getAttribute("error-label") || "Filters for this category could not be loaded.",
            );
        }
    }

    clearManagedParams() {
        if (typeof location === "undefined" || typeof history === "undefined") {
            return;
        }
        const params = new URLSearchParams(location.search);
        let changed = false;
        for (const name of this.managedParams()) {
            if (params.has(name)) {
                params.delete(name);
                changed = true;
            }
        }
        if (!changed) {
            return;
        }
        const query = params.toString();
        history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
        queueMicrotask(() => this.host.ownerDocument.dispatchEvent(new Event("cms-params:change")));
    }

    currentCategory() {
        if (typeof location === "undefined") {
            return "";
        }
        return (
            new URLSearchParams(location.search).get(this.host.getAttribute("category-param") || "category")?.trim() ||
            ""
        );
    }
}
