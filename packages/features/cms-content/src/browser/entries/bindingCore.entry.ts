import { CMS_BINDING_CORE_TAG } from "cms-content/blocs/core/markup/bindings/types";
import {
    BindingCore,
    mutationFormRequest,
    MutationFormError,
    sourceFormRequest,
    SourceFormError,
} from "cms-content/browser";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, {
    mutationFormRequest,
    MutationFormError,
    sourceFormRequest,
    SourceFormError,
});

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
