import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/bindings";
import { Component } from "@bernouy/cms-content/browser";
import {
    BindingCore,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setBindingFilters,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
} from "@bernouy/cms-content/browser";

setBindingFilters({
    json: (value) => (value === undefined ? undefined : JSON.stringify(value)),
    jsonurl: (value) => (value === undefined ? undefined : encodeURIComponent(JSON.stringify(value))),
    lines: (value) => (Array.isArray(value) ? value.join("\n") : value),
});

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}

const runtime = {
    Component,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
};
Object.defineProperty(window, "cmsRuntime", { configurable: true, value: runtime, writable: true });
