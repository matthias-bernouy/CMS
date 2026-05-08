import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { TDataAuth, TDataProvider } from 'src/socle/interfaces/Data/data';
import { parseAuth } from './auth';

export type DataProviderUpdateDto = Partial<Pick<TDataProvider, 'name' | 'sourceUrl' | 'spec'>> & {
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

    if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length === 0) {
            throw new InvalidParam('name', 'Must be a non-empty string.');
        }
        if (body.name.trim().length > 100) {
            throw new InvalidParam('name', 'Maximum 100 characters.');
        }
        dto.name = body.name.trim();
    }

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
