import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { BindingCore } from "@bernouy/components/binding";

/**
 * Delivery-runtime registration for runtime-owned system blocs.
 *
 * The data-binding activation root is a SYSTEM bloc (reserved `cms-` prefix):
 * it ships with the delivery runtime rather than being installed per-site like
 * a `base-*` library bloc, and bypasses the user-bloc pipeline (`validateBloc`)
 * entirely.
 * `renderPage` injects it when the page contains the activation root; delivered
 * pages are currently wrapped in that root by default.
 */
if (!customElements.get(CMS_BINDING_CORE_TAG)) {
    customElements.define(CMS_BINDING_CORE_TAG, BindingCore);
}
