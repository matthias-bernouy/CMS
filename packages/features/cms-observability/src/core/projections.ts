import type { LogDetail, LogSummary, StoredLogEntry } from "cms-observability/interfaces/Journal";

export function detail(entry: StoredLogEntry): LogDetail {
    const { expiresAt: _expiresAt, fingerprint: _fingerprint, ...result } = entry;
    return result;
}

export function summary(entry: StoredLogEntry): LogSummary {
    const { attributes: _attributes, error: _error, ...result } = detail(entry);
    return result;
}
