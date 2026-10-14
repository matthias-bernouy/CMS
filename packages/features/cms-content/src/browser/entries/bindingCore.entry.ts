import { CMS_BINDING_CORE_TAG } from "cms-content/blocs/core/markup/bindings/types";
import { BindingCore, mutationFormRequest, MutationFormError } from "cms-content/browser";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, {
    mutationFormRequest,
    MutationFormError,
});

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
