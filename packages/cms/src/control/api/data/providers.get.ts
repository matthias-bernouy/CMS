import type { ControlCms } from 'src/control/ControlCms';

export default async function getDataProviders(_req: Request, cms: ControlCms) {
    const list = await cms.repository.getDataProvidersList();
    return new Response(JSON.stringify(list), {
        headers: { 'Content-Type': 'application/json' },
    });
}
