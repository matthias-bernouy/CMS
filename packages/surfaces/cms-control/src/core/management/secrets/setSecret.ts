import type { ControlCms } from "cms-control/ControlCms";
import type { SecretDto } from "cms-control/core/validation/secrets/parseSecretDto";
import { assertGenericSecretKeyAllowed } from "cms-control/core/management/secrets/reservedSecretKeys";

export async function setSecret(cms: ControlCms, dto: SecretDto): Promise<void> {
    assertGenericSecretKeyAllowed(dto.key);
    await cms.secrets.set(dto.key, dto.value);
}
