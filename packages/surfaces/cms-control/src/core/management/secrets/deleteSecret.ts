import type { ControlCms } from "cms-control/ControlCms";
import { validateSecretKey } from "@bernouy/cms-secrets";

export async function deleteSecret(cms: ControlCms, key: string): Promise<void> {
    validateSecretKey(key);
    await cms.secrets.delete(key);
}
