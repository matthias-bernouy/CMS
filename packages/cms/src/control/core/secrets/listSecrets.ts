import type { ControlCms } from "src/control/ControlCms";

export async function listSecrets(cms: ControlCms) {
    return cms.secrets.list();
}

export async function listSecretKeys(cms: ControlCms) {
    return cms.secrets.listKeys();
}
