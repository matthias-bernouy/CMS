import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/bindings";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/media/browser";
import { Component } from "@bernouy/components/base";
import {
    BindingCore,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setBindingFilters,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
} from "@bernouy/components/binding";

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
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    syncProviderMediaImage,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
};
Object.defineProperty(window, "cmsRuntime", { configurable: true, value: runtime, writable: true });

installProviderMediaImageRuntime(document);
