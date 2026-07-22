import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { deleteSecret } from "cms-control/core/management/secrets/deleteSecret";
import { withValidationResponse } from "cms-control/core/management/secrets/withValidationResponse";

export default async function deleteSecretEndpoint(req: Request, cms: ControlCms) {
    return withValidationResponse(async () => {
        const url = new URL(req.url);
        const key = url.searchParams.get("key");
        if (!key) {
            throw new MissingParam("key");
        }
        await deleteSecret(cms, key);
        return new Response();
    });
}
