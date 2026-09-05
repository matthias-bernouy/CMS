import { errorMessageFromBody, headersObject, HttpResponseError, relayItem } from "./helpers";
import { PresentedPicker } from "./presentation";

const functionPaths = {
    getRelayPointForOrder: "/.cms/sources/system-functions/getRelayPointForOrder",
    setRelayPointForOrder: "/.cms/sources/system-functions/setRelayPointForOrder",
};

export class OperationalPicker extends PresentedPicker {
    async search() {
        this.syncPostalCodeValidity();
        if (!this.form.reportValidity()) {
            return;
        }
        const country = this.country();
        if (!country) {
            this.setCopyStatus("country-required-message", "error");
            return;
        }
        this.setBusy(true);
        this.setCopyStatus("searching-message", "idle");
        try {
            const url = new URL(this.relayPointsPath(), window.location.origin);
            url.searchParams.set("postalCode", this.postalCodeInput.value.trim());
            if (this.cityInput.value.trim()) {
                url.searchParams.set("city", this.cityInput.value.trim());
            }
            url.searchParams.set("country", country);
            url.searchParams.set("limit", this.getAttribute("limit") || "8");
            const weight = this.getAttribute("weight-grams")?.trim();
            if (weight) {
                url.searchParams.set("weightGrams", weight);
            }

            const data = await this.requestJson(url);
            this.items = Array.isArray(data.items) ? data.items.map(relayItem).filter(Boolean) : [];
            this.renderList();
            this.setCopyStatus(
                this.items.length
                    ? this.items.length === 1
                        ? "results-one-message"
                        : "results-many-message"
                    : "empty-message",
                "idle",
                { count: this.items.length },
            );
        } finally {
            this.setBusy(false);
        }
    }
    async selectRelay(item) {
        this.setBusy(true);
        if (this.orderId()) {
            this.setCopyStatus("saving-message", "idle");
        } else {
            this.setStatus("", "idle");
        }
        try {
            let selected = item;
            if (this.orderId()) {
                const result = await this.requestFunction("setRelayPointForOrder", {
                    method: "POST",
                    body: JSON.stringify({
                        orderId: this.orderId(),
                        relayLocation: item.location,
                        country: item.country,
                        postalCode: this.postalCodeInput.value.trim(),
                        city: this.cityInput.value.trim(),
                    }),
                });
                selected = relayItem(result?.selection || result) || item;
            }
            this.applySelection(selected, true);
            this.setCopyStatus("selected-message", "success");
        } finally {
            this.setBusy(false);
        }
    }
    async restoreSelection() {
        if (!this.orderId()) {
            return;
        }
        const selection = relayItem(
            await this.requestFunction("getRelayPointForOrder", {
                query: { orderId: this.orderId() },
            }),
        );
        if (selection) {
            this.applySelection(selection, false);
            this.setCopyStatus("restored-message", "success");
        }
    }
    async requestFunction(id, options = {}) {
        const path = functionPaths[id];
        if (!path) {
            throw new Error(`Undeclared delivery function: ${id}`);
        }
        const url = new URL(path, window.location.origin);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
        return this.requestJson(url, options);
    }

    relayPointsPath() {
        const sourceId = this.getAttribute("source-id")?.trim() || "delivery";
        if (!/^[a-z][a-z0-9-]{0,62}$/.test(sourceId)) {
            throw new Error("The delivery source installation id must be one URL path segment.");
        }
        return `/.cms/sources/${encodeURIComponent(sourceId)}/relayPoints`;
    }

    async requestJson(url, options = {}) {
        const { query: _query, ...requestOptions } = options;
        const response = await fetch(url, {
            credentials: "include",
            ...requestOptions,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
                ...headersObject(options.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new HttpResponseError(response.status, errorMessageFromBody(body, response));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Invalid delivery service response.");
        }
        return body;
    }
}
