import type { ControlCms } from 'src/control/ControlCms';
import { syncDataProvider } from 'src/control/core/dataProvider/syncDataProvider';

export default async function postDataProviderSync(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const result = await syncDataProvider(cms, id);
    if (!result) return new Response('Not found', { status: 404 });

    return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
    });
}
