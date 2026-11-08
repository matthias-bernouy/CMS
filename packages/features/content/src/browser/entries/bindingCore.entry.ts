import { CMS_BINDING_CORE_TAG } from "content/blocs/core/markup/bindings/types";
import { BindingCore, mutationFormRequest, MutationFormError } from "content/browser/binding/bindingCore";
import { getCmsBrowserRuntime } from "content/browser/runtimeGlobal";

const runtime = getCmsBrowserRuntime(window);

Object.assign(runtime, {
    mutationFormRequest,
    MutationFormError,
});

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
