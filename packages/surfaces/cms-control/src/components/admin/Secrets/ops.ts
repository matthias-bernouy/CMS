import { showToast } from "@bernouy/components";
import { postSecret, deleteSecret } from "./actions";

/**
 * Per-operation handlers that bridge the network layer (`actions.ts`) to
 * UI feedback (toasts + DOM cleanup). Kept out of the main component so
 * the lifecycle/setup logic stays focused.
 */

export async function opSaveRow(api: string, key: string, value: string): Promise<void> {
    const r = await postSecret(api, key, value);
    if (r.ok) {
        showToast(`Secret ${key} updated`, { type: "success" });
    } else {
        showToast(`Update failed: ${r.error}`, { type: "error" });
    }
}

export async function opDeleteSecret(api: string, key: string): Promise<void> {
    if (!confirm(`Delete secret "${key}"?`)) {
        return;
    }
    const r = await deleteSecret(api, key);
    if (r.ok) {
        showToast(`Secret ${key} deleted`, { type: "success" });
    } else {
        showToast(`Delete failed: ${r.error}`, { type: "error" });
    }
}
