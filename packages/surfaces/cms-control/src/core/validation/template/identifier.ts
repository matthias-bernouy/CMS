import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import { isValidSnippetIdentifier } from '@bernouy/cms-content';

/**
 * Templates use the same slug shape as snippets — kebab-case, lowercase
 * letters and digits — so we delegate to the existing validator instead of
 * cloning the rule.
 */
export function assertValidTemplateIdentifier(value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new InvalidParam('identifier', 'Must be a non-empty string.');
    }
    if (!isValidSnippetIdentifier(value)) {
        throw new InvalidParam('identifier', 'Use kebab-case (lowercase letters, digits, single dashes).');
    }
}
