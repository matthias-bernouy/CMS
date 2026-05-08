import type { ControlCms } from 'src/control/ControlCms';
import { syncDataProvider } from 'src/control/core/dataProvider/syncDataProvider';

export default async function postDataProviderSync(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const result = await syncDataProvider(cms, id);
    if (!result) return new Response('Not found', { status: 404 });

    // Surface upstream/auth failures as a non-2xx so callers (cms-form,
    // EventToast on `form:failed`) can react. The body still carries the
    // structured `{ ok, error }` payload.
    return new Response(JSON.stringify(result), {
        status:  result.ok ? 200 : 502,
        headers: { 'Content-Type': 'application/json' },
    });
}
