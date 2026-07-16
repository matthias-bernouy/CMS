import type { ControlCms } from "cms-control/ControlCms";
import { isReservedSecretKey } from "cms-control/core/secrets/reservedSecretKeys";

export async function listSecrets(cms: ControlCms) {
    const keys = (await cms.secrets.listKeys()).filter(key => !isReservedSecretKey(key));
    const values = await Promise.all(keys.map(async key => ({ key, value: await cms.secrets.get(key) })));
    return values
        .filter((secret): secret is { key: string; value: string } => secret.value !== null);
}

export async function listSecretKeys(cms: ControlCms) {
    return (await cms.secrets.listKeys()).filter(key => !isReservedSecretKey(key));
}
