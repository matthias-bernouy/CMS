import type { CredentialSelect } from "./CredentialSelect";
import { showToast } from "@bernouy/components";
import { secretKeyError } from "@bernouy/cms-secrets";
import { createCredential } from "./flows";
import { closePanel, keyToRef, refreshList, setValue } from "./controller";

type P9rInput = HTMLElement & { value: string };

/**
 * Body-level `<p9r-modal>` create form (the `cms-token-create` idiom).
 *
 * Appended to `document.body` so it escapes the editor's transformed
 * subtree — a native `<dialog>.showModal()` nested in a transformed
 * ancestor centres inside that box, not the viewport. Light-DOM
 * `p9r-input`/`p9r-button` children self-style. This custom flow keeps the
 * dialog open long enough to expose the newly created secret reference.
 * Open/close = toggling the `open` attribute.
 */

function buildModal(host: CredentialSelect): HTMLElement {
    const m = document.createElement("p9r-modal");
    m.setAttribute("aria-label", "Create credential");
    // Everything in the default (body) slot — the cms-token-create idiom. The
    // modal's header/footer slots stay collapsed; we own the title + actions.
    m.innerHTML = `
        <p9r-stack gap="md">
            <strong class="cs-create-title">Create credential</strong>
            <p9r-input data-role="key" label="Key" placeholder="MY_API_KEY"
                hint="Uppercase letters, digits, underscore"></p9r-input>
            <p9r-input data-role="value" label="Value" type="password"
                placeholder="Kept server-side"></p9r-input>
            <p9r-stack direction="row" gap="sm" justify="end">
                <p9r-button data-role="cancel" variant="outlined">Cancel</p9r-button>
                <p9r-button data-role="create" color="primary">Create</p9r-button>
            </p9r-stack>
        </p9r-stack>`;
    m.querySelector('[data-role="cancel"]')!.addEventListener("click", () => m.removeAttribute("open"));
    m.querySelector('[data-role="create"]')!.addEventListener("click", () => void submitCreate(host));
    document.body.appendChild(m);
    return m;
}

function inputs(m: HTMLElement) {
    return {
        key:   m.querySelector('[data-role="key"]')   as P9rInput,
        value: m.querySelector('[data-role="value"]') as P9rInput,
    };
}

export function openCreateDialog(host: CredentialSelect): void {
    const m = host._createModal ??= buildModal(host);
    const { key, value } = inputs(m);
    key.value = "";
    value.value = "";
    key.removeAttribute("invalid");
    key.removeAttribute("hint-level");
    key.setAttribute("hint", "Uppercase letters, digits, underscore");
    m.setAttribute("open", "");
    setTimeout(() => (key as unknown as HTMLElement).focus?.(), 0);
}

export function destroyCreateDialog(host: CredentialSelect): void {
    host._createModal?.remove();
    host._createModal = undefined;
}

export async function submitCreate(host: CredentialSelect): Promise<void> {
    const m = host._createModal;
    if (!m) return;
    const { key: keyInput, value: valueInput } = inputs(m);
    const key   = keyInput.value.trim();
    const value = valueInput.value;
    const keyError = secretKeyError(key);
    if (keyError) {
        keyInput.setAttribute("invalid", "");
        keyInput.setAttribute("hint", keyError);
        keyInput.setAttribute("hint-level", "error");
        showToast(`Invalid key: ${keyError}`, { type: "error" });
        return;
    }
    if (host._keys.includes(key)) {
        showToast(`Credential ${key} already exists`, { type: "warning" });
        return;
    }
    const r = await createCredential(host._api, key, value);
    if (!r.ok) { showToast(`Create failed: ${r.error}`, { type: "error" }); return; }
    showToast(`Credential ${key} created`, { type: "success" });
    m.removeAttribute("open");
    await refreshList(host);
    setValue(host, keyToRef(key));
    host.dispatchEvent(new Event("change", { bubbles: true }));
    closePanel(host);
}
