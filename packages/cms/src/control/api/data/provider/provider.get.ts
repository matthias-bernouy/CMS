import type { ControlCms } from 'src/control/ControlCms';

/**
 * Full provider record (including spec + secrets cleartext) for the CLI
 * pull flow AND the admin edit modal. Authenticated like every admin
 * endpoint — never exposed to delivery or to anonymous callers.
 *
 * `_rulesAndSecretsJson` is a pre-stringified `{rules, secrets}` blob
 * so the admin template can hand it to `<cms-data-provider-rules
 * initial="…">` without needing a JSON pipe in the templating engine.
 */
export default async function getDataProvider(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const provider = await cms.repository.getDataProvider(id);
    if (!provider) return new Response('Not found', { status: 404 });

    const _rulesAndSecretsJson = JSON.stringify({
        rules:   provider.rules,
        secrets: provider.secrets,
    });
    return new Response(JSON.stringify({ ...provider, _rulesAndSecretsJson }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
