import type { ControlCms } from 'src/control/ControlCms';

/**
 * Full provider record (including spec + auth secrets) for the CLI pull
 * flow. Authenticated like every admin endpoint — never exposed to
 * delivery or to anonymous callers.
 */
export default async function getDataProvider(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const provider = await cms.repository.getDataProvider(id);
    if (!provider) return new Response('Not found', { status: 404 });

    return new Response(JSON.stringify(provider), {
        headers: { 'Content-Type': 'application/json' },
    });
}
