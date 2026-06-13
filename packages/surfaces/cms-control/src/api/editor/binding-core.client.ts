import { BindingCore } from "@bernouy/components/binding";

if (!customElements.get("cms-binding-core")) {
    customElements.define("cms-binding-core", BindingCore);
}
