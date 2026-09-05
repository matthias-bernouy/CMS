import { relayCopy } from "./copy";
import { errorMessage, relayAddress, relayItem } from "./helpers";
import { RenderedPicker } from "./rendered-picker";

export class PresentedPicker extends RenderedPicker {
    syncPresentation(changedAttribute = "") {
        this.titleElement.textContent = this.getAttribute("title") || "Choose a pickup point";
        this.copyElement.textContent = this.getAttribute("copy") || "Find available pickup points near you.";
        this.searchButton.textContent = this.getAttribute("button-label") || "Search";
        this.clearButton.textContent = this.getAttribute("change-label") || "Change";
        if (!changedAttribute || changedAttribute === "postal-code") {
            this.postalCodeInput.value = this.getAttribute("postal-code")?.trim() ?? "";
            this.syncPostalCodeValidity();
        }
        if (!changedAttribute || changedAttribute === "city") {
            this.cityInput.value = this.getAttribute("city")?.trim() ?? "";
        }
        this.root.querySelector("[data-postal-code-label]").textContent = this.copy("postal-code-label");
        this.root.querySelector("[data-city-label]").textContent = this.copy("city-label");
        if (changedAttribute === "postal-code-required-message") {
            this.syncPostalCodeValidity();
        }
        if (changedAttribute === "selection-label" && !this.selectedItem) {
            this.renderList();
        }
        if (this.statusCopy) {
            const { name, state, values } = this.statusCopy;
            this.setCopyStatus(name, state, values);
        }
        this.syncDisabled();
    }

    copy = (name, values = {}) => {
        const content = this.getAttribute(name)?.trim() || relayCopy[name] || "";
        return Object.entries(values).reduce(
            (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
            content,
        );
    };

    setCopyStatus(name, state, values = {}) {
        this.setStatus(this.copy(name, values), state);
        this.statusCopy = { name, state, values };
    }

    syncPostalCodeValidity() {
        const input = this.postalCodeInput;
        input.setCustomValidity("");
        if (!input.value.trim()) {
            input.setCustomValidity(this.copy("postal-code-required-message"));
        }
        return input.validity.valid;
    }

    renderList() {
        this.list.replaceChildren();
        for (const item of this.items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option";
            button.setAttribute("role", "listitem");
            const copy = document.createElement("span");
            copy.className = "option-copy";
            const title = document.createElement("strong");
            title.textContent = item.name;
            const address = document.createElement("span");
            address.className = "address";
            address.textContent = relayAddress(item);
            const choose = document.createElement("span");
            choose.className = "choose";
            choose.textContent = this.getAttribute("selection-label") || "Select";
            copy.append(title, address);
            button.append(copy, choose);
            button.addEventListener("click", () => {
                this.selectRelay(item).catch((error) => this.fail(error));
            });
            this.list.append(button);
        }
    }
    applySelection(item, emit) {
        this.selectedItem = item;
        this.setAttribute("value", item.location);
        this.internalsRef.setFormValue(item.location);
        this.selectedBox.hidden = false;
        this.selectedName.textContent = item.name;
        this.selectedAddress.textContent = relayAddress(item);
        this.list.replaceChildren();
        if (emit) {
            this.dispatchEvent(
                new CustomEvent("mossa-mondial-relay-picker:change", {
                    bubbles: true,
                    composed: true,
                    detail: {
                        ...item,
                        searchPostalCode: this.postalCodeInput.value.trim(),
                        searchCity: this.cityInput.value.trim(),
                        orderId: this.orderId() || null,
                    },
                }),
            );
            this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
    }

    clearForChange() {
        this.selectedItem = null;
        this.removeAttribute("value");
        this.internalsRef.setFormValue("");
        this.selectedBox.hidden = true;
        this.renderList();
        this.setCopyStatus("change-message", "idle");
    }
    renderPreview() {
        const country = this.country() || "US";
        const first = relayItem({
            relayLocation: `${country}-DEMO`,
            name: "Central pickup point",
            addressLine1: "12 Main Street",
            postalCode: this.getAttribute("postal-code")?.trim() || "10001",
            city: this.getAttribute("city")?.trim() || "Sample City",
            country,
        });
        if (!first) {
            return;
        }
        this.items = [first];
        this.renderList();
    }
    setBusy(value) {
        this.busy = value;
        this.syncDisabled();
    }

    syncDisabled() {
        for (const control of this.root.querySelectorAll("input, button")) {
            control.disabled = this.disabled || this.busy;
        }
    }

    setStatus(message, state) {
        this.statusCopy = null;
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    fail(error) {
        this.setStatus(errorMessage(error, this.copy), "error");
        this.setBusy(false);
    }

    country() {
        return (this.getAttribute("country")?.trim() || "").toUpperCase();
    }
    orderId() {
        return this.getAttribute("order-id")?.trim() || "";
    }
    get form() {
        return this.root.querySelector("form");
    }
    get titleElement() {
        return this.root.querySelector("[data-title]");
    }
    get copyElement() {
        return this.root.querySelector("[data-copy]");
    }
    get postalCodeInput() {
        return this.root.querySelector("[name='postalCode']");
    }
    get cityInput() {
        return this.root.querySelector("[name='city']");
    }
    get searchButton() {
        return this.root.querySelector("[data-search]");
    }
    get clearButton() {
        return this.root.querySelector("[data-clear]");
    }
    get selectedBox() {
        return this.root.querySelector("[data-selected]");
    }
    get selectedName() {
        return this.root.querySelector("[data-selected-name]");
    }
    get selectedAddress() {
        return this.root.querySelector("[data-selected-address]");
    }
    get list() {
        return this.root.querySelector("[data-list]");
    }
    get status() {
        return this.root.querySelector("[data-status]");
    }
}
