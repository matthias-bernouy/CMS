import type { ControlCms } from "cms-control/ControlCms";

export async function listSecrets(cms: ControlCms) {
    return (await listSecretKeys(cms)).map((key) => ({ key }));
}

export async function listSecretKeys(cms: ControlCms) {
    return cms.secrets.listKeys();
}
