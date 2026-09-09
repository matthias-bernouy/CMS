import { HttpResponseError, relayItem } from "./helpers";
import { PresentedPicker } from "./presentation";
import { SourceFormError, sourceFormRequest } from "@bernouy/components/binding";

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
            const data = await this.submitSource("relay-search", {
                postalCode: this.postalCodeInput.value.trim(),
                city: this.cityInput.value.trim(),
                country,
                limit: this.getAttribute("limit") || "8",
                weightGrams: this.getAttribute("weight-grams")?.trim() || "",
            });
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
                const result = await this.submitSource("relay-save", {
                    orderId: this.orderId(),
                    relayLocation: item.location,
                    country: item.country,
                    postalCode: this.postalCodeInput.value.trim(),
                    city: this.cityInput.value.trim(),
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
        const selection = relayItem(await this.submitSource("relay-restore", { orderId: this.orderId() }));
        if (selection) {
            this.applySelection(selection, false);
            this.setCopyStatus("restored-message", "success");
        }
    }

    async submitSource(id, values) {
        let result;
        try {
            result = await sourceFormRequest(this, id, values);
        } catch (error) {
            if (error instanceof SourceFormError) {
                throw new HttpResponseError(error.status, error.message);
            }
            throw error;
        }
        if (!result || typeof result !== "object" || Array.isArray(result)) {
            throw new Error("Invalid delivery service response.");
        }
        return result;
    }
}
