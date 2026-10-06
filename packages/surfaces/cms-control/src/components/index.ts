import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/bindings";
import { BindingCore, setBindingFilters } from "@bernouy/components";

function define(tag: string, constructor: CustomElementConstructor) {
    if (!customElements.get(tag)) {
        customElements.define(tag, constructor);
    }
}

setBindingFilters({
    json: (value) => (value === undefined ? undefined : JSON.stringify(value)),
    jsonurl: (value) => (value === undefined ? undefined : encodeURIComponent(JSON.stringify(value))),
    lines: (value) => (Array.isArray(value) ? value.join("\n") : value),
});
// Existing binding cores connect during registration and must capture the admin filters.
define(CMS_BINDING_CORE_TAG, BindingCore);
import "./globals";
