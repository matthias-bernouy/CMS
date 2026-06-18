import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { BindingCore } from "@bernouy/components/binding";

if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
