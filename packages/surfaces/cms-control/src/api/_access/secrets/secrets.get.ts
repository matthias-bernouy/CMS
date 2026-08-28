import type { ControlCms } from "cms-control/ControlCms";
import { listSecrets } from "cms-control/core/management/secrets/listSecrets";

export type SecretSummary = Readonly<{ key: string }>;

export default async function getSecretsEndpoint(_req: Request, cms: ControlCms) {
    const data: SecretSummary[] = await listSecrets(cms);
    return new Response(JSON.stringify(data), {
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json",
        },
    });
}
