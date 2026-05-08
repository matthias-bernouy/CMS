import InvalidParam from 'src/control/errors/Http/InvalidParam';
import { isValidDataProviderId } from 'src/socle/utils/validation';

export function assertValidDataProviderId(value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new InvalidParam('id', 'Must be a non-empty string.');
    }
    if (!isValidDataProviderId(value)) {
        throw new InvalidParam('id', 'Use kebab-case (lowercase letters, digits, single dashes), 2-32 characters.');
    }
}
