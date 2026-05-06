/**
 * Pipe filters for `{{ path | filter }}` interpolation. Each filter is
 * a one-arg `(value: unknown) => unknown` and is purely cosmetic — bad
 * inputs return `""` rather than throw, so a malformed log line can't
 * crash the page.
 *
 * Adding a new filter: register it here. Lookup is exact-match by name,
 * unknown filters fall through to the raw value.
 */
export type Filter = (value: unknown) => unknown;

const NUMBER_FORMAT = new Intl.NumberFormat();

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
function formatBytes(value: unknown): string {
    const n = toFiniteNumber(value);
    if (n === null) return '';
    if (n < 1024) return `${n} B`;
    let v = n, u = 0;
    while (v >= 1024 && u < BYTE_UNITS.length - 1) { v /= 1024; u++; }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${BYTE_UNITS[u]}`;
}

function formatDate(value: unknown): string {
    const ms = toFiniteNumber(value);
    if (ms === null || ms <= 0) return '';
    return new Date(ms).toISOString().slice(0, 10);
}

function formatDatetime(value: unknown): string {
    const ms = toFiniteNumber(value);
    if (ms === null || ms <= 0) return '';
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function formatAgo(value: unknown): string {
    const ms = toFiniteNumber(value);
    if (ms === null || ms <= 0) return '';
    const diff = Math.max(0, Date.now() - ms);
    const sec = Math.floor(diff / 1000);
    if (sec <  60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

function formatNumber(value: unknown): string {
    const n = toFiniteNumber(value);
    return n === null ? '' : NUMBER_FORMAT.format(n);
}

function formatPercent(value: unknown): string {
    const n = toFiniteNumber(value);
    return n === null ? '' : `${Math.round(n * 100)}%`;
}

function formatBool(value: unknown): string {
    if (value === true)  return 'yes';
    if (value === false) return 'no';
    return '';
}

export const FILTERS: Record<string, Filter> = {
    bytes:    formatBytes,
    date:     formatDate,
    datetime: formatDatetime,
    ago:      formatAgo,
    number:   formatNumber,
    percent:  formatPercent,
    bool:     formatBool,
};

function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}
