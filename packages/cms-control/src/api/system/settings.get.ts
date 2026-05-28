import type { ControlCms } from "src/control/ControlCms";
import { getSettings } from "src/control/core/settings/getSettings";

export default async function getSettingsEndpoint(_req: Request, cms: ControlCms) {
    const data = await getSettings(cms);
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
