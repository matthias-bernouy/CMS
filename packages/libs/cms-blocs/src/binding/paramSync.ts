/**
 * `cms-param-sync` — two-way binding between a form control's value and a query
 * param. The PRODUCER side of the reactive layer (engine-owned, symmetric to the
 * `#{}` consumer side); it only talks to the neutral `setParam` API, so a custom
 * form could produce the same params without it.
 *
 * Both directions:
 *  - **value → param**: typing (debounced) / selecting writes the param via
 *    `setParam`, which reloads any `#{key}`-dependent source.
 *  - **param → value**: the control reflects the current param — on start
 *    (bookmarked URLs), when the params change (back/forward, another input
 *    sharing the key), AND when the control's own children change. That last one
 *    matters for a `<select>` whose options are loaded by a source: the seed must
 *    re-apply once the options exist, or the dropdown stays blank while the data
 *    is correctly filtered.
 *
 * The key is the attribute value (`cms-param-sync="search"`) or the control's
 * `name`. A loop guard stops a programmatic reflect from echoing back as a write.
 */

import { setParam, currentParams, PARAMS_CHANGE_EVENT } from "./params";

export const PARAM_SYNC_ATTR = "cms-param-sync";

const DEBOUNCE_MS = 300;

export class ParamSync {
    private readonly key: string;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private reflectTimer: ReturnType<typeof setTimeout> | null = null;
    private last: string | null = null;
    private reflecting = false;
    private childObserver: MutationObserver | null = null;
    private readonly onInput = () => this.schedule();
    private readonly onChange = () => this.write();
    private readonly onParams = () => this.reflect();
    // Options arriving (async <select>) reflect on a macrotask, AFTER the
    // component's own slotchange has rebuilt its option list — otherwise
    // `set value` runs before the matching option exists and is a no-op.
    private readonly onChildren = () => {
        if (this.reflectTimer) clearTimeout(this.reflectTimer);
        this.reflectTimer = setTimeout(() => this.reflect(), 0);
    };

    constructor(private readonly el: Element) {
        this.key = (el.getAttribute(PARAM_SYNC_ATTR) || "").trim() || (el as HTMLInputElement).name || "";
    }

    start(): void {
        if (!this.key) {
            console.warn(`${PARAM_SYNC_ATTR}: no key — set ${PARAM_SYNC_ATTR}="<param>" or a name attribute`, this.el);
            return;
        }
        this.reflect();
        this.el.addEventListener("input", this.onInput);
        this.el.addEventListener("change", this.onChange);
        document.addEventListener(PARAMS_CHANGE_EVENT, this.onParams);
        window.addEventListener("popstate", this.onParams);
        // Re-apply when the control's options arrive (async-populated <select>).
        this.childObserver = new MutationObserver(this.onChildren);
        this.childObserver.observe(this.el, { childList: true });
    }

    dispose(): void {
        this.el.removeEventListener("input", this.onInput);
        this.el.removeEventListener("change", this.onChange);
        document.removeEventListener(PARAMS_CHANGE_EVENT, this.onParams);
        window.removeEventListener("popstate", this.onParams);
        this.childObserver?.disconnect();
        this.childObserver = null;
        if (this.timer) clearTimeout(this.timer);
        if (this.reflectTimer) clearTimeout(this.reflectTimer);
        this.timer = this.reflectTimer = null;
    }

    /**
     * param → value. Two guards:
     *  - skipped while a debounced local edit is in flight, so an incoming param
     *    change never clobbers what the user is mid-typing (the user's edit then
     *    wins and writes);
     *  - `set` flags `reflecting` so the programmatic assignment can't echo back
     *    as a write.
     * `last` tracks the control's ACTUAL post-set value — a custom control
     * (`<p9r-select>`) rejects a `value` set when its options aren't loaded yet,
     * so recording the intended value would wrongly dedupe a later real pick.
     */
    private reflect(): void {
        if (this.timer) return; // a debounced local edit is in flight — let it win
        const v = currentParams().get(this.key) ?? "";
        const el = this.el as HTMLInputElement;
        if (el.type === "checkbox") {
            const checked = v !== "" && v === (el.value || "true");
            if (el.checked !== checked) this.set(() => { el.checked = checked; });
        } else if (el.value !== v) {
            this.set(() => { el.value = v; });
        }
        this.last = this.currentValue();
    }

    private set(apply: () => void): void {
        this.reflecting = true;
        try { apply(); } finally { this.reflecting = false; }
    }

    /** The value `write` would push to the param — the dedupe / seed reference. */
    private currentValue(): string {
        const el = this.el as HTMLInputElement;
        return el.type === "checkbox" ? (el.checked ? el.value || "true" : "") : el.value ?? "";
    }

    private schedule(): void {
        if (this.reflecting) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.write(), DEBOUNCE_MS);
    }

    /** value → param. */
    private write(): void {
        if (this.reflecting) return;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        const value = this.currentValue();
        if (value === this.last) return; // dedupe input+change and no-op changes
        this.last = value;
        setParam(this.key, value);
    }
}
