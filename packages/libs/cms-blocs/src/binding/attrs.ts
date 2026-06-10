export const BINDING_CORE_TAG = "cms-binding-core";
/**
 * Marks a subtree the runtime must NOT discover sources within. Unlike a
 * nested `<cms-binding-core>` (which owns its own data), a `[cms-bind-stop]`
 * region is left INERT: the editor wraps the injected page content in it so the
 * chrome core still INJECTS the content (`bindSubtree` traverses it — the
 * `{{ content | innerHTML }}` interpolation runs) but never registers or
 * executes the content's own `cms-source` / `cms-param-sync`. The content stays
 * an editable template; rendering it with data is delivery's job. RUNTIME-
 * discovery boundary only (it does NOT stop `bindSubtree`), and a complete
 * no-op in delivery where no element carries it.
 */
export const BIND_STOP_ATTR = "cms-bind-stop";
export const READY_ATTR = "cms-ready";
