import { CMS_BINDING_CORE_TAG } from "cms-content/blocs/core/markup/bindings/types";
import {
    BindingCore,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
} from "cms-content/browser";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
});

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
