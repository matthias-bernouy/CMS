import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { TDataAuth, TDataProvider } from 'src/socle/interfaces/Data/data';
import { parseAuth } from './auth';

export type DataProviderUpdateDto = Partial<Pick<TDataProvider, 'sourceUrl' | 'server' | 'spec'>> & {
    auth?: TDataAuth;
};

/**
 * Validates an update body. `id`, `source`, `createdAt` are immutable —
 * silently dropped if present. The `auth` field is rebuilt via the same
 * dotted-key parser used at create-time. Only the fields explicitly set
 * by the caller are forwarded to the repository.
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

    if (hasAuthFields(body)) {
        dto.auth = parseAuth(body);
    }

    return dto;
}

function hasAuthFields(body: Record<string, unknown>): boolean {
    for (const key of Object.keys(body)) {
        if (key === 'auth.bearer' || key.startsWith('auth.headers.')) return true;
    }
    return false;
}
