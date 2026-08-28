import type { ControlCms } from "cms-control/ControlCms";
import { isReservedSecretKey } from "cms-control/core/management/secrets/reservedSecretKeys";

export async function listSecrets(cms: ControlCms) {
    return (await listSecretKeys(cms)).map((key) => ({ key }));
}

export async function listSecretKeys(cms: ControlCms) {
    return (await cms.secrets.listKeys()).filter((key) => !isReservedSecretKey(key));
}
