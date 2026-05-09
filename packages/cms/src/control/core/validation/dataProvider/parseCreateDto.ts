import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import type { TDataAuth } from 'src/socle/interfaces/Data/data';
import { assertValidDataProviderId } from './id';
import { parseAuth } from './auth';

export type DataProviderCreateDto = {
    id: string;
    source: 'url';
    sourceUrl: string;
    specAuth:    TDataAuth;
    runtimeAuth: TDataAuth;
};

/**
 * Validates a create-provider request. Phase 2 only accepts `source: 'url'`
 * — `file`, `paste` and `official` are rejected here even though the UI
 * shows their tabs disabled, as defense in depth.
 *
 * Both `specAuth` (used to fetch the OpenAPI spec) and `runtimeAuth`
 * (forwarded by the proxy on every API call) are read from the body. If
 * either section is empty, we default to `{ type: 'none' }` — a public
 * spec or a public API both round-trip cleanly.
 */
export function parseDataProviderCreateDto(body: Record<string, unknown>): DataProviderCreateDto {
    const { id, source, sourceUrl } = body;

    if (!id)        throw new MissingParam('id');
    if (!source)    throw new MissingParam('source');
    if (!sourceUrl) throw new MissingParam('sourceUrl');

    assertValidDataProviderId(id);

    if (source !== 'url') {
        throw new InvalidParam('source', 'Only "url" is supported in this phase.');
    }

    if (typeof sourceUrl !== 'string') {
        throw new InvalidParam('sourceUrl', 'Must be a string.');
    }
    let parsed: URL;
    try { parsed = new URL(sourceUrl); }
    catch { throw new InvalidParam('sourceUrl', 'Must be a valid absolute URL.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new InvalidParam('sourceUrl', 'Only http(s) URLs are accepted.');
    }

    return {
        id,
        source:      'url',
        sourceUrl:   parsed.toString(),
        specAuth:    parseAuth(body, 'specAuth'),
        runtimeAuth: parseAuth(body, 'runtimeAuth'),
    };
}
