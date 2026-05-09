import type { ControlCms } from 'src/control/ControlCms';
import { deleteDataProvider } from 'src/control/core/dataProvider/deleteDataProvider';

export default async function deleteDataProviderEndpoint(req: Request, cms: ControlCms) {
    const url   = new URL(req.url);
    const id    = url.searchParams.get('id');
    const force = url.searchParams.get('force') === 'true';
    if (!id) return new Response('Missing id', { status: 400 });

    const provider = await cms.repository.getDataProvider(id);
    if (!provider) return new Response('Not found', { status: 404 });

    if (!force) {
        const consumers = await cms.repository.findConsumersOfProvider(provider.id);
        const total = consumers.pages.length + consumers.templates.length + consumers.snippets.length;
        if (total > 0) {
            return new Response(JSON.stringify({
                error: `Provider "${id}" is referenced by ${total} consumer${total === 1 ? '' : 's'}.`,
                ...consumers,
            }), {
                status:  409,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    await deleteDataProvider(cms, id);
    return new Response('Deleted', { status: 200 });
}
