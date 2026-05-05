import { mark } from "./agent/marks";
import { startObservers } from "./agent/observers";
import { patchDefine, trackWhenDefined } from "./agent/customElements";
import { scheduleReport } from "./agent/reporter";

/**
 * Opt-in diagnostic agent served at `<basePath>/.cms/assets/diagnostic.js`
 * and pulled in via a parser-blocking `<script src>` at the top of <head>
 * when `DeliveryCmsConfig.diagnosticEnabled` is on. Parser-blocking +
 * top-of-head means it executes *before* any deferred bloc IIFE registers
 * its tag, so the `customElements.define` monkeypatch lands in time.
 *
 * Activation is double-gated: the script is only emitted when the server
 * flag is on, and within that emitted script the body only runs when the
 * URL carries `?p9r-diag=1`. With the flag on but no querystring, the cost
 * is one HTTP round-trip + one early-return — no observers, no patching.
 *
 * Output: a sorted `console.table` on the `load` event plus
 * `window.__p9rDiag` for ad-hoc inspection. Nothing is sent off-box.
 */
function readDiagTags(): string[] {
    const meta = document.querySelector('meta[name="p9r-diag-tags"]') as HTMLMetaElement | null;
    if (!meta) return [];
    try {
        const parsed = JSON.parse(meta.content);
        return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
        return [];
    }
}

(function diag() {
    if (new URLSearchParams(location.search).get("p9r-diag") !== "1") return;

    mark("nav-start", undefined, undefined, location.pathname + location.search);
    patchDefine();
    trackWhenDefined(readDiagTags());
    startObservers();
    scheduleReport();
})();
