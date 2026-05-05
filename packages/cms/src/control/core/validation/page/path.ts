import { isValidPathFormat } from 'src/socle/utils/validation';
import InvalidParam from 'src/control/errors/Http/InvalidParam';

export function assertValidPagePath(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !isValidPathFormat(value)) {
        throw new InvalidParam('path', "Must start with '/' and contain only [a-zA-Z0-9-/].");
    }
}
