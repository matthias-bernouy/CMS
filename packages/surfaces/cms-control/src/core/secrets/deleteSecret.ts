import type { ControlCms } from "cms-control/ControlCms";
import { validateSecretKey } from "@bernouy/cms-secrets";
import { assertGenericSecretKeyAllowed } from "cms-control/core/secrets/reservedSecretKeys";

export async function deleteSecret(cms: ControlCms, key: string): Promise<void> {
    validateSecretKey(key);
    assertGenericSecretKeyAllowed(key);
    await cms.secrets.delete(key);
}
