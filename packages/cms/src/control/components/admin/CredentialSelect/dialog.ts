import type { CredentialSelect } from "./CredentialSelect";
import { showToast } from "src/control/core/showToast";
import { createCredential } from "./flows";
import { closePanel, keyToRef, refreshList, setValue } from "./controller";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Modal mini-dialog opened from the picker's "+ Create new credential"
 * button. Native `<dialog>` so it stacks above the parent modal in the
 * top-layer (no clipping, ESC closes natively, focus trapped).
 */

export function openCreateDialog(host: CredentialSelect): void {
    host._refs.dialogKey.value = "";
    host._refs.dialogValue.value = "";
    host._refs.dialog.showModal();
    setTimeout(() => host._refs.dialogKey.focus(), 0);
}

export async function submitCreate(host: CredentialSelect): Promise<void> {
    const key   = host._refs.dialogKey.value.trim();
    const value = host._refs.dialogValue.value;
    if (!KEY_PATTERN.test(key)) {
        showToast("Invalid key: must match /^[A-Z][A-Z0-9_]*$/", { type: "error" });
        return;
    }
    if (host._keys.includes(key)) {
        showToast(`Credential ${key} already exists`, { type: "warning" });
        return;
    }
    const r = await createCredential(host._api, key, value);
    if (!r.ok) { showToast(`Create failed: ${r.error}`, { type: "error" }); return; }
    showToast(`Credential ${key} created`, { type: "success" });
    host._refs.dialog.close();
    await refreshList(host);
    setValue(host, keyToRef(key));
    host.dispatchEvent(new Event("change", { bubbles: true }));
    closePanel(host);
}
