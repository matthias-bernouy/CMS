import type { ControlCms } from "src/control/ControlCms";
import { listSecrets } from "src/control/core/secrets/listSecrets";

export default async function getSecretsEndpoint(_req: Request, cms: ControlCms) {
    const data = await listSecrets(cms);
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
