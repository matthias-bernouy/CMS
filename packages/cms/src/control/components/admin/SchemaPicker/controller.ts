import type { SlimEndpoint } from "src/control/core/data/types";
import type { SchemaPicker } from "./SchemaPicker";
import { fetchEndpoints, fetchProviders, type ProviderListItem } from "./flows";
import { buildDataProxyUrl, parseDataProxyUrl } from "src/socle/constants/p9r-constants";

/**
 * Build the proxy URL emitted on selection:
 * `<DATA_PROXY_PREFIX>/<providerId><path>`. The page resolves it
 * same-origin against the bucket edge, which forwards to the upstream
 * API stored on the provider — the upstream URL never appears in the
 * persisted bloc DOM, which is what allows CSP `connect-src 'self'`.
 */
export function buildUrl(providerId: string, path: string): string {
    return buildDataProxyUrl(providerId, path);
}

/**
 * Reverse-lookup for the trigger label and the round-trip pre-selection:
 * given a saved value (always a proxy URL after this rewrite), return
 * the provider whose id sits in the path. `null` when the value doesn't
 * match the proxy shape or names an unknown provider.
 */
export function findProviderForValue(providers: ProviderListItem[], value: string): ProviderListItem | null {
    const parsed = parseDataProxyUrl(value);
    if (!parsed) return null;
    return providers.find(p => p.id === parsed.providerId) ?? null;
}

/**
 * Path component of a saved value, or `""` when the value isn't a valid
 * proxy URL. Used by `setValue` and `renderEndpoints` to decorate the
 * trigger and pre-select the matching list entry.
 */
function extractPath(value: string): string {
    return parseDataProxyUrl(value)?.path ?? "";
}

export function setValue(host: SchemaPicker, url: string): void {
    host._value = url;
    host._internals.setFormValue(url);
    // `<p9r-attr-sync>` may push a value into the picker before its own
    // `connectedCallback` has run (the panel template is stamped fragment-
    // first, then attached). Skip UI updates while `_refs` is undefined —
    // `connectedCallback` re-applies the buffered value once the shadow is
    // built.
    if (!host._refs) return;
    const has = !!url;
    host._refs.trigger.classList.toggle("has-value", has);
    host._refs.clearBtn.style.display = has ? "flex" : "none";
    // Method label is purely a hint inside the dropdown now — clear it on
    // the trigger because the saved value no longer carries the method.
    host._refs.triggerMethod.textContent = "";
    if (has) {
        const match = findProviderForValue(host._providers, url);
        host._refs.triggerValue.textContent = match
            ? extractPath(url) || "/"
            : url;
    } else {
        host._refs.triggerValue.textContent = "Select endpoint";
    }
}

export function openPanel(host: SchemaPicker): void {
    positionPanel(host);
    host._refs.panel.showPopover();
    host._refs.trigger.classList.add("open");
    host._isOpen = true;
    void initProviderState(host);
    setTimeout(() => host._refs.search.focus(), 0);
}

export function closePanel(host: SchemaPicker): void {
    if (host._refs.panel.matches(":popover-open")) host._refs.panel.hidePopover();
    host._refs.trigger.classList.remove("open");
    host._isOpen = false;
    host._refs.search.value = "";
    renderEndpoints(host);
}

/**
 * Anchor the popover under the trigger. If a comfortable width would
 * overflow on the right (e.g. trigger in a narrow side panel), right-align
 * it to the trigger instead. Final width is clamped to fit the viewport.
 */
function positionPanel(host: SchemaPicker): void {
    const GUTTER = 8;
    const r = host._refs.trigger.getBoundingClientRect();
    const p = host._refs.panel;

    const maxWidth = window.innerWidth - GUTTER * 2;
    const width    = Math.min(Math.max(r.width, 360), maxWidth);

    let left = r.left;
    if (left + width > window.innerWidth - GUTTER) {
        left = Math.max(GUTTER, r.right - width);
    }

    p.style.top      = `${r.bottom + 4}px`;
    p.style.left     = `${left}px`;
    p.style.width    = `${width}px`;
    p.style.position = "fixed";
}

/**
 * On panel open: load the provider list (cached after first fetch),
 * re-sync the dropdown, then load endpoints for the active provider
 * (the one whose server matches the current value, falling back to
 * the first).
 */
async function initProviderState(host: SchemaPicker): Promise<void> {
    if (host._providers.length === 0) {
        host._providers = await fetchProviders(host._api);
        renderProviderOptions(host);
        // Refresh the trigger now that we know the providers — the path-only
        // label needs the matching provider's server prefix to compute.
        setValue(host, host._value);
    }
    const match    = findProviderForValue(host._providers, host._value);
    const fallback = host._providers[0]?.id ?? "";
    const active   = match?.id ?? fallback;
    if (active && active !== host._activeProviderId) {
        host._refs.providerSelect.value = active;
        await loadEndpointsFor(host, active);
    } else {
        renderEndpoints(host);
    }
}

export async function loadEndpointsFor(host: SchemaPicker, providerId: string): Promise<void> {
    host._activeProviderId = providerId;
    if (!host._endpointsByProvider.has(providerId)) {
        host._endpointsByProvider.set(providerId, await fetchEndpoints(host._api, providerId));
    }
    renderEndpoints(host);
}

function renderProviderOptions(host: SchemaPicker): void {
    host._refs.providerSelect.replaceChildren(...host._providers.map(p => {
        const opt = document.createElement("option");
        opt.value       = p.id;
        opt.textContent = p.id;
        return opt;
    }));
}

export function renderEndpoints(host: SchemaPicker): void {
    const all     = host._endpointsByProvider.get(host._activeProviderId) ?? [];
    const q       = host._refs.search.value.trim().toLowerCase();
    const allowed = parseMethodsFilter(host.getAttribute("methods"));
    const filtered = all.filter(e => {
        if (allowed && !allowed.has(e.method.toUpperCase())) return false;
        if (!q) return true;
        return e.path.toLowerCase().includes(q)
            || e.summary.toLowerCase().includes(q)
            || e.tags.some(t => t.toLowerCase().includes(q));
    });

    const parsed       = parseDataProxyUrl(host._value);
    const selectedPath = parsed?.providerId === host._activeProviderId ? parsed.path : "";
    host._refs.list.replaceChildren(...filtered.map(e => buildOption(e, e.path === selectedPath)));
}

/** Parse `methods="GET,POST"` into a Set; null = no filter (accept every method). */
export function parseMethodsFilter(raw: string | null): Set<string> | null {
    if (!raw) return null;
    const set = new Set(raw.split(",").map(m => m.trim().toUpperCase()).filter(Boolean));
    return set.size > 0 ? set : null;
}

function buildOption(ep: SlimEndpoint, selected: boolean): HTMLLIElement {
    const li = document.createElement("li");
    li.className     = "option" + (selected ? " selected" : "");
    li.dataset.id    = ep.id;
    li.innerHTML = `
        <span class="option-method">${ep.method}</span>
        <span class="option-path"></span>
        ${ep.summary ? `<span class="option-summary"></span>` : ""}
    `;
    (li.querySelector(".option-path") as HTMLElement).textContent = ep.path;
    if (ep.summary) (li.querySelector(".option-summary") as HTMLElement).textContent = ep.summary;
    return li;
}
