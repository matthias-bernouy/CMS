import type { CredentialSelect } from "./CredentialSelect";
import { secretKeyToRef, secretRefToKey } from "@bernouy/cms-secrets";
import { fetchKeys } from "./flows";

/** Storage `${KEY}` ↔ display `KEY`. */
export function refToDisplay(ref: string): string {
    return secretRefToKey(ref) ?? "";
}
export function keyToRef(key: string): string {
    return secretKeyToRef(key);
}

export function setValue(host: CredentialSelect, ref: string): void {
    host._value = ref;
    host._internals.setFormValue(ref);
    const display = refToDisplay(ref);
    host._refs.display.textContent = display || "No credential";
    const has = ref !== "";
    host._refs.trigger.classList.toggle("has-value", has);
    host._refs.clearBtn.style.display = has ? "flex" : "none";
    host._refs.list.querySelectorAll<HTMLElement>(".option").forEach((li) => {
        li.classList.toggle("selected", li.dataset.key === display);
    });
}

export function openPanel(host: CredentialSelect): void {
    positionPanel(host);
    host._refs.panel.showPopover();
    host._refs.trigger.classList.add("open");
    host._isOpen = true;
    void refreshList(host);
    setTimeout(() => host._refs.search.focus(), 0);
}

export function closePanel(host: CredentialSelect): void {
    if (host._refs.panel.matches(":popover-open")) {
        host._refs.panel.hidePopover();
    }
    host._refs.trigger.classList.remove("open");
    host._isOpen = false;
    host._refs.search.value = "";
    renderList(host, host._keys);
}

/**
 * Anchors the popover under the trigger via inline `top`/`left`/`width`.
 * Top-layer ignores all containing-block weirdness, so plain viewport
 * coordinates are correct regardless of `transform`/`overflow` ancestors.
 */
function positionPanel(host: CredentialSelect): void {
    const r = host._refs.trigger.getBoundingClientRect();
    const p = host._refs.panel;
    p.style.top = `${r.bottom + 4}px`;
    p.style.left = `${r.left}px`;
    p.style.width = `${r.width}px`;
    p.style.position = "fixed";
}

export async function refreshList(host: CredentialSelect): Promise<void> {
    host._keys = await fetchKeys(host._api);
    host._keys.sort((a, b) => a.localeCompare(b));
    renderList(host, host._keys);
}

export function renderList(host: CredentialSelect, keys: string[]): void {
    const selected = refToDisplay(host._value);
    host._refs.list.replaceChildren(...keys.map((k) => buildOption(k, k === selected)));
}

function buildOption(key: string, selected: boolean): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "option" + (selected ? " selected" : "");
    li.dataset.key = key;
    li.textContent = key;
    return li;
}
