import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";
import { deleteSecret } from "src/control/core/secrets/deleteSecret";
import { withValidationResponse } from "src/control/core/secrets/withValidationResponse";

export default async function deleteSecretEndpoint(req: Request, cms: ControlCms) {
    return withValidationResponse(async () => {
        const url = new URL(req.url);
        const key = url.searchParams.get("key");
        if (!key) throw new MissingParam("key");
        await deleteSecret(cms, key);
        return new Response();
    });
}
