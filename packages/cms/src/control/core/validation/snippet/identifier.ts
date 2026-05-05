import InvalidParam from 'src/control/errors/Http/InvalidParam';
import { isValidSnippetIdentifier } from 'src/socle/utils/validation';

export function assertValidSnippetIdentifier(value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new InvalidParam('identifier', 'Must be a non-empty string.');
    }
    if (!isValidSnippetIdentifier(value)) {
        throw new InvalidParam('identifier', 'Use kebab-case (lowercase letters, digits, single dashes).');
    }
}
