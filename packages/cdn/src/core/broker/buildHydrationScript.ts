import { StorageBrowser, type StorageBrowserHydration } from "../../exports/StorageBrowser";

/**
 * Builds the `<script>` body that — when evaluated in the browser — assigns
 * a fully constructed `StorageBrowser` to `globalThis[varName]`. The class
 * source is included verbatim via `constructor.toString()`; that's why
 * `StorageBrowser` carries the strict portability contract documented on
 * its definition.
 *
 * Returned string must NOT be wrapped in a `<script>` tag here — the caller
 * decides between `Content-Type: application/javascript` (route) or inline
 * `<script>` (SSR template). The caller is also responsible for HTML-escaping
 * if embedded inline.
 */
export function buildHydrationScript(varName: string, hydration: StorageBrowserHydration): string {
    return `globalThis[${JSON.stringify(varName)}] = new (${StorageBrowser.toString()})(${JSON.stringify(hydration)});`;
}
