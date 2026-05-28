import type { ControlCms } from "cms-control/ControlCms";
import { getSettings } from "cms-control/core/settings/getSettings";

export default async function getSettingsEndpoint(_req: Request, cms: ControlCms) {
    const data = await getSettings(cms);
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
