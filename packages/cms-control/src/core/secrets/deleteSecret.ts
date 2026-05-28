import type { ControlCms } from "src/control/ControlCms";
import { validateSecretKey } from "src/control/core/validation/secrets/parseSecretDto";

export async function deleteSecret(cms: ControlCms, key: string): Promise<void> {
    validateSecretKey(key);
    await cms.secrets.delete(key);
}
