import type { RulesConfig } from "@bernouy/cdn-buckets";
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { TDataAuth, TDataProvider } from 'src/socle/interfaces/Data/data';
import { parseAuth, hasAuthFields } from './auth';
import { parseRulesAndSecrets, hasRulesFields } from './rules';

export type DataProviderUpdateDto = Partial<Pick<TDataProvider, 'sourceUrl' | 'server' | 'spec'>> & {
    specAuth?: TDataAuth;
    rules?:    RulesConfig;
    secrets?:  Record<string, string>;
};

/**
 * Validates an update body. `id`, `source`, `createdAt` are immutable —
 * silently dropped if present. `specAuth.*` and `rules` / `secrets.*`
 * are independently re-parsed when at least one of their fields is in
 * the body — letting the UI patch one section without resending the
 * other.
 */
export function parseDataProviderUpdateDto(body: Record<string, unknown>): DataProviderUpdateDto {
    const dto: DataProviderUpdateDto = {};

    if (body.sourceUrl !== undefined) {
        if (typeof body.sourceUrl !== 'string') {
            throw new InvalidParam('sourceUrl', 'Must be a string.');
        }
        let parsed: URL;
        try { parsed = new URL(body.sourceUrl); }
        catch { throw new InvalidParam('sourceUrl', 'Must be a valid absolute URL.'); }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new InvalidParam('sourceUrl', 'Only http(s) URLs are accepted.');
        }
        dto.sourceUrl = parsed.toString();
    }

    if (body.server !== undefined) {
        if (typeof body.server !== 'string') {
            throw new InvalidParam('server', 'Must be a string.');
        }
        const trimmed = body.server.trim();
        if (trimmed.length > 0) {
            let parsed: URL;
            try { parsed = new URL(trimmed); }
            catch { throw new InvalidParam('server', 'Must be a valid absolute URL or empty.'); }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                throw new InvalidParam('server', 'Only http(s) URLs are accepted.');
            }
            dto.server = parsed.toString();
        } else {
            dto.server = "";
        }
    }

    if (body.spec !== undefined) {
        if (typeof body.spec !== 'string') {
            throw new InvalidParam('spec', 'Must be a string.');
        }
        dto.spec = body.spec;
    }

    if (hasAuthFields(body, 'specAuth')) dto.specAuth = parseAuth(body, 'specAuth');
    if (hasRulesFields(body)) {
        const { rules, secrets } = parseRulesAndSecrets(body);
        dto.rules   = rules;
        dto.secrets = secrets;
    }

    return dto;
}
