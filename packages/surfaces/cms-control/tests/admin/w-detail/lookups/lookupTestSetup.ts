import { P9rInput, Button, Combobox, P9rSelect } from "@bernouy/components";
import "../../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

if (!customElements.get("p9r-input")) {
    customElements.define("p9r-input", P9rInput);
}
if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}
if (!customElements.get("p9r-combobox")) {
    customElements.define("p9r-combobox", Combobox);
}
if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}

const realFetch = globalThis.fetch;

export function resetLookupTest(): void {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
}
