import { showToast } from "cms-control/core/showToast";
import { postSecret, deleteSecret } from "./actions";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Per-operation handlers that bridge the network layer (`actions.ts`) to
 * UI feedback (toasts + DOM cleanup). Kept out of the main component so
 * the lifecycle/setup logic stays focused.
 */

export async function opSaveRow(api: string, key: string, value: string): Promise<void> {
    const r = await postSecret(api, key, value);
    if (r.ok) showToast(`Secret ${key} updated`, { type: 'success' });
    else      showToast(`Update failed: ${r.error}`, { type: 'error' });
}

export async function opAddSecret(
    api: string,
    keyEl: HTMLInputElement,
    valueEl: HTMLInputElement,
    knownKeys: Set<string>,
): Promise<void> {
    const key   = keyEl.value.trim();
    const value = valueEl.value;
    if (!key)                 { showToast('Key is required', { type: 'error' }); return; }
    if (!KEY_PATTERN.test(key)) {
        showToast(`Invalid key: must match /^[A-Z][A-Z0-9_]*$/`, { type: 'error' });
        return;
    }
    if (knownKeys.has(key)) {
        showToast(`Secret ${key} already exists — edit it inline below`, { type: 'warning' });
        return;
    }
    const r = await postSecret(api, key, value);
    if (r.ok) {
        keyEl.value = ''; valueEl.value = '';
        showToast(`Secret ${key} created`, { type: 'success' });
    } else {
        showToast(`Create failed: ${r.error}`, { type: 'error' });
    }
}

export async function opDeleteSecret(api: string, key: string): Promise<void> {
    if (!confirm(`Delete secret "${key}"?`)) return;
    const r = await deleteSecret(api, key);
    if (r.ok) showToast(`Secret ${key} deleted`, { type: 'success' });
    else      showToast(`Delete failed: ${r.error}`, { type: 'error' });
}
