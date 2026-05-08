import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import type { TDataAuth } from 'src/socle/interfaces/Data/data';
import { assertValidDataProviderId } from './id';
import { parseAuth } from './auth';

export type DataProviderCreateDto = {
    id: string;
    name: string;
    source: 'url';
    sourceUrl: string;
    auth: TDataAuth;
};

/**
 * Validates a create-provider request. Phase 2 only accepts `source: 'url'`
 * — `file`, `paste` and `official` are rejected here even though the UI
 * shows their tabs disabled, as defense in depth.
 */
export function parseDataProviderCreateDto(body: Record<string, unknown>): DataProviderCreateDto {
    const { id, name, source, sourceUrl } = body;

    if (!id)        throw new MissingParam('id');
    if (!name)      throw new MissingParam('name');
    if (!source)    throw new MissingParam('source');
    if (!sourceUrl) throw new MissingParam('sourceUrl');

    assertValidDataProviderId(id);

    if (typeof name !== 'string' || name.trim().length === 0) {
        throw new InvalidParam('name', 'Must be a non-empty string.');
    }
    if (name.trim().length > 100) {
        throw new InvalidParam('name', 'Maximum 100 characters.');
    }

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
        name:      name.trim(),
        source:    'url',
        sourceUrl: parsed.toString(),
        auth:      parseAuth(body),
    };
}
