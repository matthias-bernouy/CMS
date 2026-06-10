import type { ControlCms } from "cms-control/ControlCms";
import { validateSecretKey } from "cms-control/core/validation/secrets/parseSecretDto";

export async function deleteSecret(cms: ControlCms, key: string): Promise<void> {
    validateSecretKey(key);
    await cms.secrets.delete(key);
}
