import type { ControlCms } from 'src/control/ControlCms';
import { deleteDataProvider } from 'src/control/core/dataProvider/deleteDataProvider';

export default async function deleteDataProviderEndpoint(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const removed = await deleteDataProvider(cms, id);
    if (!removed) return new Response('Not found', { status: 404 });
    return new Response('Deleted', { status: 200 });
}
