import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export type FormState = "default" | "loading" | "error" | "success";

/**
 * `<base-form>` — wraps a native `<form>`, collects light-DOM `[name]`
 * inputs, and keeps submit local for the static migration. Exposes 4 states
 * via `data-state` on `.state-host` so a CSS rule swaps the visible slot:
 * `default` (form), `loading`, `error`, `success`.
 */
export class Bloc extends Component {
    static observedAttributes = [
        "action",
        "method",
        "autocomplete",
        "novalidate",
        "as",
        "mode",
        "debounce",
        "cms-source",
        "cms-source-method",
        "success-redirect",
        "success-redirect-param",
        "success-redirect-delay",
        "cms-source-success-redirect",
        "cms-source-success-redirect-param",
        "cms-source-success-redirect-delay",
    ];

    private _stateHost: HTMLElement | null = null;
    private _form: HTMLFormElement | null = null;
    private _message: HTMLElement | null = null;
    private _state: FormState = "default";
    private _urlSyncTimer: number | null = null;
    private _urlSyncInitial: Map<string, string[]> | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._stateHost = root.querySelector(".state-host");
        this._form = root.querySelector("form");
        this._message = root.querySelector(".message");
        if (!this._form) {
            return;
        }

        this._syncFormAttrs(this._form);
        this._hydrateQueryParamValues();
        this._form.addEventListener("submit", this._onSubmit);
        this._form.addEventListener("reset", this._onFormReset);
        this.addEventListener("click", this._onHostClick);
        this.addEventListener("change", this._onChange);
        // Snapshot the initial collected state once children have upgraded,
        // so `_writeUrl` can omit names that the user hasn't actually
        // changed. rAF is enough since custom elements upgrade during the
        // current task.
        requestAnimationFrame(() => this._captureInitialUrlSnapshot());
        if (this.hasAttribute("autosubmit")) {
            const missing = this._missingRequiredQueryParam();
            if (missing) {
                this._setMessage(this.getAttribute("missing-query-message") || "Lien invalide ou expiré.", "error");
            } else {
                requestAnimationFrame(() => this._requestSubmit());
            }
        }
    }

    disconnectedCallback(): void {
        if (this._urlSyncTimer != null) {
            window.clearTimeout(this._urlSyncTimer);
            this._urlSyncTimer = null;
        }
        this._form?.removeEventListener("submit", this._onSubmit);
        this._form?.removeEventListener("reset", this._onFormReset);
        this.removeEventListener("click", this._onHostClick);
        this.removeEventListener("change", this._onChange);
    }

    attributeChangedCallback() {
        if (this._form) {
            this._syncFormAttrs(this._form);
        }
    }

    // ── Internal ────────────────────────────────────────────────────

    private _syncFormAttrs(form: HTMLFormElement) {
        for (const name of ["method", "autocomplete"]) {
            const value = this.getAttribute(name);
            if (value) {
                form.setAttribute(name, value);
            } else {
                form.removeAttribute(name);
            }
        }
        if (this.hasAttribute("novalidate")) {
            form.setAttribute("novalidate", "");
        } else {
            form.removeAttribute("novalidate");
        }
    }

    private _sourceUrl(): string | null {
        const raw = (this.getAttribute("action") || this.getAttribute("cms-source"))?.trim();
        if (!raw) {
            return null;
        }
        const path = raw.split(/\s+as\s+/i)[0]?.trim();
        if (!path) {
            return null;
        }
        return new URL(path, location.origin).toString();
    }

    private _sourceMethod(): string {
        return (this.getAttribute("cms-source-method") || this.getAttribute("method") || "POST").toUpperCase();
    }

    private _hasStateSlot(name: FormState): boolean {
        return this.querySelector(`[slot="${name}"]`) !== null;
    }

    private _setSourceState(state: FormState): void {
        if (state === "default" || this._hasStateSlot(state)) {
            this._setState(state);
        } else {
            this._setState("default");
        }
    }

    private _setMessage(message: string, state: "idle" | "error" | "success" = "idle"): void {
        if (!this._message) {
            return;
        }
        this._message.textContent = message;
        this._message.dataset.state = state;
    }

    private _hydrateQueryParamValues(): void {
        const params = new URLSearchParams(location.search);
        this.querySelectorAll<HTMLElement>("[data-query-param]").forEach((el) => {
            const paramName = el.getAttribute("data-query-param") || el.getAttribute("name") || "";
            if (!paramName) {
                return;
            }
            const value = params.get(paramName) ?? "";
            const anyEl = el as { value?: unknown };
            if ("value" in anyEl) {
                anyEl.value = value;
            } else {
                el.setAttribute("value", value);
            }
        });
    }

    private _missingRequiredQueryParam(): string | null {
        const params = new URLSearchParams(location.search);
        for (const el of this.querySelectorAll<HTMLElement>("[data-query-param]")) {
            const paramName = el.getAttribute("data-query-param") || el.getAttribute("name") || "";
            if (!paramName) {
                continue;
            }
            if (!params.get(paramName)) {
                return paramName;
            }
        }
        return null;
    }

    private _redirectTarget(): string | null {
        const paramName =
            this.getAttribute("cms-source-success-redirect-param") || this.getAttribute("success-redirect-param");
        const fromParam = paramName ? new URLSearchParams(location.search).get(paramName) : null;
        const target =
            fromParam || this.getAttribute("cms-source-success-redirect") || this.getAttribute("success-redirect");
        if (!target) {
            return null;
        }
        if (!target.startsWith("/") || target.startsWith("//")) {
            return null;
        }
        return target;
    }

    private async _submitSource(values: Record<string, unknown>, form: HTMLFormElement): Promise<void> {
        const sourceUrl = this._sourceUrl();
        if (!sourceUrl) {
            return;
        }

        this.toggleAttribute("busy", true);
        this._setMessage(this.getAttribute("loading-message") || "", "idle");
        this._setSourceState("loading");

        try {
            const method = this._sourceMethod();
            const url = new URL(sourceUrl);
            const init: RequestInit = {
                method,
                credentials: "include",
                headers: { accept: "application/json" },
            };

            if (method === "GET") {
                for (const [name, value] of Object.entries(values)) {
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            url.searchParams.append(name, String(item));
                        }
                    } else if (value != null) {
                        url.searchParams.set(name, String(value));
                    }
                }
            } else {
                init.headers = { ...init.headers, "content-type": "application/json" };
                init.body = JSON.stringify(values);
            }

            const response = await fetch(url.toString(), init);
            const contentType = response.headers.get("content-type") || "";
            const body = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
            const text = body === null ? await response.text().catch(() => "") : "";
            if (!response.ok) {
                throw new Error(this._errorMessage(body, response, text));
            }

            this.dispatchEvent(
                new CustomEvent("base-form-source:success", {
                    bubbles: true,
                    composed: true,
                    detail: { values, form, response, body },
                }),
            );
            this._setMessage(this.getAttribute("success-message") || "", "success");
            this._setSourceState("success");
            this.dispatchEvent(
                new CustomEvent("base-form:success", {
                    bubbles: true,
                    composed: true,
                    detail: { values, body },
                }),
            );

            const target = this._redirectTarget();
            if (target) {
                const delay = Number(
                    this.getAttribute("cms-source-success-redirect-delay") ||
                        this.getAttribute("success-redirect-delay") ||
                        "250",
                );
                window.setTimeout(() => this._navigate(target), Number.isFinite(delay) ? delay : 250);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Une erreur est survenue.";
            this._setMessage(message, "error");
            this._setSourceState("error");
            this.dispatchEvent(
                new CustomEvent("base-form-source:error", {
                    bubbles: true,
                    composed: true,
                    detail: { values, form, error },
                }),
            );
        } finally {
            this.toggleAttribute("busy", false);
        }
    }

    private _errorMessage(body: unknown, response: Response, text = ""): string {
        const raw =
            body && typeof body === "object" && "error" in body
                ? String((body as { error: unknown }).error)
                : text.trim();
        const messages: Record<string, string> = {
            invalid_credentials: "Email ou mot de passe incorrect.",
            rate_limited: "Trop de tentatives. Réessaie dans quelques minutes.",
            "Invalid token: invalid or expired": "Lien invalide ou expiré.",
            "Invalid token: required": "Lien invalide ou expiré.",
            "Invalid email: invalid": "Adresse email invalide.",
            "Invalid password: at least 8 characters": "Le mot de passe doit contenir au moins 8 caractères.",
        };
        if (raw && messages[raw]) {
            return messages[raw];
        }
        if (raw.startsWith("Invalid token:")) {
            return "Lien invalide ou expiré.";
        }
        if (raw.startsWith("Invalid email:")) {
            return "Adresse email invalide.";
        }
        if (raw.startsWith("Invalid password:")) {
            return "Mot de passe invalide.";
        }
        if (raw) {
            return raw;
        }
        return `${response.status} ${response.statusText}`;
    }

    private _navigate(target: string): void {
        const link = document.createElement("a");
        link.href = target;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
    }

    /** Mode `url-sync` writes `[name]` input values to `location.search`
     *  via `history.pushState` on every `change` event, debounced. The form
     *  never submits in this mode — submit click is a no-op below. */
    private _isUrlSync(): boolean {
        return this.getAttribute("mode") === "url-sync";
    }

    private _onChange = (_e: Event) => {
        if (!this._isUrlSync()) {
            return;
        }
        if (this._urlSyncTimer != null) {
            window.clearTimeout(this._urlSyncTimer);
        }
        const wait = Number(this.getAttribute("debounce") ?? "100");
        this._urlSyncTimer = window.setTimeout(
            () => {
                this._urlSyncTimer = null;
                this._writeUrl();
            },
            isFinite(wait) ? wait : 100,
        );
    };

    private _collectUrlState(): Map<string, string[]> {
        const out = new Map<string, string[]>();
        this.querySelectorAll<HTMLElement>("[name]").forEach((el) => {
            const name = el.getAttribute("name");
            if (!name) {
                return;
            }
            const anyEl = el as { checked?: boolean; value?: unknown };
            const isToggle = "checked" in anyEl;
            if (isToggle && anyEl.checked === false) {
                return;
            }
            // Toggles: the host's `value` attribute is the source of truth
            // (the inner native input often carries `<p9r-comp-sync>`
            // defaults like "on" / "option" rather than user intent).
            const raw = isToggle
                ? (el.getAttribute("value") ?? "")
                : ((anyEl.value ?? el.getAttribute("value") ?? "") as unknown);
            const list = Array.isArray(raw) ? raw : [raw];
            for (const v of list) {
                if (v == null || v === "") {
                    continue;
                }
                const arr = out.get(name) ?? [];
                arr.push(String(v));
                out.set(name, arr);
            }
        });
        return out;
    }

    private _captureInitialUrlSnapshot(): void {
        if (this._urlSyncInitial) {
            return;
        }
        this._urlSyncInitial = this._collectUrlState();
    }

    /** Walk the prototype chain to detect a defined `value` accessor —
     *  custom elements that intentionally expose `.value` (input/select/
     *  range/etc.) have it on their class prototype, whereas container
     *  blocs don't. We rely on this to avoid
     *  setting `.value` on containers, which would create an own
     *  property that subsequent reads then pick up. */
    private _hasValueAccessor(el: HTMLElement): boolean {
        let proto: object | null = Object.getPrototypeOf(el);
        while (proto && proto !== HTMLElement.prototype) {
            if (Object.getOwnPropertyDescriptor(proto, "value")) {
                return true;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }

    /** Restore every `[name]` input back to its initial-snapshot value.
     *  Used by `_onFormReset` for url-sync mode — the native `form.reset()`
     *  resets the inner shadow inputs, but the custom hosts need their
     *  state attributes synced back to mount-time. */
    private _restoreUrlSyncInputs(): void {
        const initial = this._urlSyncInitial ?? new Map<string, string[]>();
        this.querySelectorAll<HTMLElement>("[name]").forEach((el) => {
            const name = el.getAttribute("name");
            if (!name) {
                return;
            }
            const anyEl = el as { checked?: boolean; value?: unknown };
            const isToggle = "checked" in anyEl;
            const initialValues = initial.get(name) ?? [];
            if (isToggle) {
                const myValue = el.getAttribute("value") ?? "";
                const shouldBeChecked = initialValues.includes(myValue);
                if (shouldBeChecked) {
                    el.setAttribute("checked", "");
                } else {
                    el.removeAttribute("checked");
                }
            } else if (this._hasValueAccessor(el)) {
                // select / range / text — set via the host's `.value`
                // setter so the bloc syncs its inner input. Some containers
                // carry `name=` but have no
                // value accessor — writing to them would create an own
                // property that later pollutes the URL.
                (anyEl as { value: unknown }).value = initialValues[0] ?? "";
            }
        });
    }

    private _onFormReset = () => {
        if (!this._isUrlSync()) {
            return;
        }
        // Inputs are in mid-reset; defer to a microtask so the native
        // reset finishes propagating through custom inputs first.
        queueMicrotask(() => {
            this._restoreUrlSyncInputs();
            // Cancel any pending debounced write — we want the clean URL
            // immediately, not 100ms later possibly stale.
            if (this._urlSyncTimer != null) {
                window.clearTimeout(this._urlSyncTimer);
                this._urlSyncTimer = null;
            }
            this._writeUrl();
        });
    };

    /** Order-independent equality between two value lists. */
    private _sameValues(a: string[], b: string[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        const sa = [...a].sort();
        const sb = [...b].sort();
        return sa.every((v, i) => v === sb[i]);
    }

    private _writeUrl(): void {
        // Lazy snapshot fallback — if the first change fires before rAF
        // captured initial state, capture it now (best-effort).
        if (!this._urlSyncInitial) {
            this._captureInitialUrlSnapshot();
        }
        const initial = this._urlSyncInitial ?? new Map<string, string[]>();
        const current = this._collectUrlState();

        // Start from the current query string and replace only the names
        // owned by THIS form. Anything else stays put — important in the
        // editor where `?id=/annonces` is the editor's own routing param.
        const params = new URLSearchParams(location.search);
        const owned = new Set<string>();
        this.querySelectorAll<HTMLElement>("[name]").forEach((el) => {
            const n = el.getAttribute("name");
            if (n) {
                owned.add(n);
            }
        });
        for (const n of owned) {
            params.delete(n);
        }

        // Only include names whose values diverged from the initial
        // snapshot — "default / untouched" filters stay out of the URL.
        for (const [name, values] of current) {
            const initialValues = initial.get(name) ?? [];
            if (this._sameValues(values, initialValues)) {
                continue;
            }
            for (const v of values) {
                params.append(name, v);
            }
        }

        const search = params.toString();
        const url = location.pathname + (search ? "?" + search : "");
        history.pushState({}, "", url);
        // pushState does NOT fire popstate, so emit an event for UI that
        // wants to react to local filter state changes.
        document.dispatchEvent(
            new CustomEvent("cms-url-sync", {
                bubbles: true,
                detail: { url, search: location.search },
            }),
        );
    }

    private _onSubmit = (e: SubmitEvent) => {
        if (this._isUrlSync()) {
            e.preventDefault();
            return;
        }
        const form = e.target as HTMLFormElement;
        const values = this._collectLightValues();

        // Local event only. Data binding / transport will be reintroduced
        // later through the standardized binding system.
        this.dispatchEvent(
            new CustomEvent("base-form-submit", {
                bubbles: true,
                composed: true,
                detail: { values, form, native: e },
            }),
        );

        const method = (this.getAttribute("method") || "post").toLowerCase();
        // `dialog` is a native form behavior tied to <dialog>; leave the
        // browser to handle it and skip the static submit handling.
        if (method === "dialog") {
            return;
        }

        e.preventDefault();
        if (this._sourceUrl()) {
            void this._submitSource(values, form);
            return;
        }
        if (this.querySelector('[slot="success"]')) {
            this._setState("success");
        }
        this.dispatchEvent(
            new CustomEvent("base-form:success", {
                bubbles: true,
                composed: true,
                detail: { values },
            }),
        );
    };

    private _setState(state: FormState) {
        if (this._state === state) {
            return;
        }
        this._state = state;
        if (this._stateHost) {
            this._stateHost.setAttribute("data-state", state);
        }
    }

    /**
     * Walks the light-DOM for `[name]` elements and harvests their values.
     *
     * Two contracts are duck-typed — base-form never imports or checks for
     * specific bloc tags:
     *
     *   - `el.files` (FileList) — if present and non-empty, the element is
     *     contributing files to the local submit payload.
     *   - `el.value` (any) — fallback for plain text/number/select/etc.
     *     Same behavior as before for the local event payload.
     *
     * Same-`name` collisions accumulate into an array regardless of which
     * branch each contribution came from.
     */
    private _collectLightValues(): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        const named = this.querySelectorAll<HTMLElement>("[name]");
        named.forEach((el) => {
            const name = el.getAttribute("name");
            if (!name) {
                return;
            }
            const anyEl = el as any;

            const files = anyEl.files as FileList | null | undefined;
            if (files && typeof files.length === "number" && files.length > 0) {
                const arr = Array.from(files);
                if (name in out) {
                    const prev = out[name];
                    out[name] = Array.isArray(prev) ? [...prev, ...arr] : [prev, ...arr];
                } else {
                    out[name] = arr.length === 1 ? arr[0] : arr;
                }
                return;
            }

            const value = anyEl.value ?? el.getAttribute("value") ?? "";
            if (name in out) {
                const prev = out[name];
                out[name] = Array.isArray(prev) ? [...prev, value] : [prev, value];
            } else {
                out[name] = value;
            }
        });
        return out;
    }

    private _onHostClick = (e: MouseEvent) => {
        const path = e.composedPath();
        for (const node of path) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }
            if (node === (this as unknown as HTMLElement)) {
                break;
            }
            const type = node.getAttribute?.("type");
            if (!type) {
                continue;
            }
            if (type === "submit") {
                this._requestSubmit();
                return;
            }
            if (type === "reset") {
                this._form?.reset();
                this.querySelectorAll<HTMLElement>("[name]").forEach((el) => {
                    const anyEl = el as any;
                    if ("value" in anyEl) {
                        anyEl.value = anyEl.defaultValue ?? "";
                    }
                    if ("checked" in anyEl) {
                        anyEl.checked = !!anyEl.defaultChecked;
                    }
                });
                return;
            }
        }
    };

    private _requestSubmit() {
        if (!this._form) {
            return;
        }
        if (typeof this._form.requestSubmit === "function") {
            this._form.requestSubmit();
        } else {
            this._form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
        }
    }
}
