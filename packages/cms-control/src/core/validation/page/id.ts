import InvalidParam from 'src/control/errors/Http/InvalidParam';

export function assertValidPageId(value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new InvalidParam('id', 'Must be a non-empty string.');
    }
}
