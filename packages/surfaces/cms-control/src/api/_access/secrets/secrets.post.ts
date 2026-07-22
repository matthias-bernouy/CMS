import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseSecretDto } from "cms-control/core/validation/secrets/parseSecretDto";
import { setSecret } from "cms-control/core/management/secrets/setSecret";
import { withValidationResponse } from "cms-control/core/management/secrets/withValidationResponse";

export default async function postSecret(req: Request, cms: ControlCms) {
    return withValidationResponse(async () => {
        const body = await readJsonBody(req);
        const dto = parseSecretDto(body);
        await setSecret(cms, dto);
        return new Response();
    });
}
