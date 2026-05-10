import type { RulesConfig } from "@bernouy/cdn-buckets";
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import type { TDataAuth } from 'src/socle/interfaces/Data/data';
import { assertValidDataProviderId } from './id';
import { parseAuth } from './auth';
import { parseRulesAndSecrets } from './rules';

export type DataProviderCreateDto = {
    id: string;
    source: 'url';
    sourceUrl: string;
    specAuth: TDataAuth;
    rules:    RulesConfig;
    secrets:  Record<string, string>;
};

/**
 * Validates a create-provider request. Phase 2 only accepts `source: 'url'`
 * — `file`, `paste` and `official` are rejected here even though the UI
 * shows their tabs disabled, as defense in depth.
 *
 * `specAuth` (used to fetch the OpenAPI spec) stays a simple
 * bearer/headers/none auth — admin-time only, never reaches the runtime
 * proxy. `rules` + `secrets` is the declarative DSL forwarded to
 * cdn-buckets and applied by the cdn-edge openresty config.
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

    const { rules, secrets } = parseRulesAndSecrets(body);

    return {
        id,
        source:    'url',
        sourceUrl: parsed.toString(),
        specAuth:  parseAuth(body, 'specAuth'),
        rules,
        secrets,
    };
}
