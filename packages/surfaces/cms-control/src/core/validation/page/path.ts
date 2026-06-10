import { isValidPathFormat } from '@bernouy/cms-content';
import InvalidParam from 'cms-control/errors/Http/InvalidParam';

export function assertValidPagePath(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !isValidPathFormat(value)) {
        throw new InvalidParam('path', "Must start with '/' and contain only [a-zA-Z0-9-/].");
    }
}
