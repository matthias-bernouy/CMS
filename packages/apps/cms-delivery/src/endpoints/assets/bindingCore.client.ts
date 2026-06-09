import { BindingCore } from "@bernouy/cms-blocs/binding";

/**
 * Delivery-runtime registration for the `<cms-binding-core>` system bloc.
 *
 * The data-binding activation root is a SYSTEM bloc (reserved `cms-` prefix):
 * it ships with the delivery runtime rather than being installed per-site like
 * a `base-*` library bloc, and bypasses the user-bloc pipeline (`validateBloc`)
 * entirely. `renderPage` injects this script ONLY when a page's composed HTML
 * actually contains the tag — the default Shell wraps content in it, but a
 * fully-customised Shell that drops the core never loads the engine, so the
 * binding system stays swappable.
 */
if (!customElements.get("cms-binding-core")) {
    customElements.define("cms-binding-core", BindingCore);
}
