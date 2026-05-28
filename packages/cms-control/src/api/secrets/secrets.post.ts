import type { ControlCms } from "src/control/ControlCms";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import { parseSecretDto } from "src/control/core/validation/secrets/parseSecretDto";
import { setSecret } from "src/control/core/secrets/setSecret";
import { withValidationResponse } from "src/control/core/secrets/withValidationResponse";

export default async function postSecret(req: Request, cms: ControlCms) {
    return withValidationResponse(async () => {
        const body = await readJsonBody(req);
        const dto  = parseSecretDto(body);
        await setSecret(cms, dto);
        return new Response();
    });
}
