import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import type { TDataAuth } from 'src/socle/interfaces/Data/data';
import { parseAuth } from './auth';

export type DataProviderTestDto = {
    sourceUrl: string;
    auth:      TDataAuth;
};

/**
 * Validates a test-connection request. Same URL + auth shape as
 * create/update — id and name are not needed because we don't persist
 * anything on test.
 */
export function parseDataProviderTestDto(body: Record<string, unknown>): DataProviderTestDto {
    const { sourceUrl } = body;
    if (!sourceUrl) throw new MissingParam('sourceUrl');

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
        sourceUrl: parsed.toString(),
        auth:      parseAuth(body),
    };
}
