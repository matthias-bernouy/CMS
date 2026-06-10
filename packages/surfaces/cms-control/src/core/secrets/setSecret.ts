import type { ControlCms } from "cms-control/ControlCms";
import type { SecretDto } from "cms-control/core/validation/secrets/parseSecretDto";

export async function setSecret(cms: ControlCms, dto: SecretDto): Promise<void> {
    await cms.secrets.set(dto.key, dto.value);
}
