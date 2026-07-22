import { errorMessageFromBody, headersObject, HttpResponseError, relayItem } from "./helpers";
import { PresentedPicker } from "./presentation";

export class OperationalPicker extends PresentedPicker {
    async search() {
        this.syncPostalCodeValidity();
        if (!this.form.reportValidity()) {
            return;
        }
        this.setBusy(true);
        this.setStatus("Recherche des points relais…", "idle");
        try {
            const url = new URL(`${this.sourceBase()}/relayPoints`, window.location.origin);
            url.searchParams.set("postalCode", this.postalCodeInput.value.trim());
            if (this.cityInput.value.trim()) {
                url.searchParams.set("city", this.cityInput.value.trim());
            }
            url.searchParams.set("country", this.country());
            url.searchParams.set("limit", this.getAttribute("limit") || "8");
            const weight = this.getAttribute("weight-grams")?.trim();
            if (weight) {
                url.searchParams.set("weightGrams", weight);
            }

            const data = await this.requestJson(url);
            this.items = Array.isArray(data.items) ? data.items.map(relayItem).filter(Boolean) : [];
            this.renderList();
            this.setStatus(
                this.items.length
                    ? `${this.items.length} point${this.items.length === 1 ? "" : "s"} relais disponible${this.items.length === 1 ? "" : "s"}.`
                    : "Aucun point relais trouvé.",
                "idle",
            );
        } finally {
            this.setBusy(false);
        }
    }
    async selectRelay(item) {
        this.setBusy(true);
        this.setStatus(this.orderId() ? "Enregistrement du point relais…" : "", "idle");
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
            this.setStatus("Point relais sélectionné.", "success");
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
            this.setStatus("Point relais enregistré pour cette commande.", "success");
        }
    }
    async requestFunction(id, options = {}) {
        const url = new URL(`/.cms/sources/system-functions/${encodeURIComponent(id)}`, window.location.origin);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
        return this.requestJson(url, options);
    }

    sourceBase() {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "delivery");
        return `${prefix}/${sourceId}`;
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
            throw new Error("Réponse du service de livraison invalide.");
        }
        return body;
    }
}
