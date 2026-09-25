export interface ContractSelectionLimits {
    readonly maxDocumentBytes: number;
    readonly maxJsonDepth: number;
    readonly maxSelections: number;
    readonly maxInstallations: number;
    readonly maxDependencies: number;
}

export const DEFAULT_CONTRACT_SELECTION_LIMITS: Readonly<ContractSelectionLimits> = Object.freeze({
    maxDocumentBytes: 1_048_576,
    maxJsonDepth: 16,
    maxSelections: 128,
    maxInstallations: 256,
    maxDependencies: 8_192,
});

export function selectionLimits(limits: Readonly<ContractSelectionLimits>): Readonly<ContractSelectionLimits> {
    const result = {
        maxDocumentBytes: limits.maxDocumentBytes,
        maxJsonDepth: limits.maxJsonDepth,
        maxSelections: limits.maxSelections,
        maxInstallations: limits.maxInstallations,
        maxDependencies: limits.maxDependencies,
    };
    if (Object.values(result).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
        throw new TypeError("Contract selection limits must be positive safe integers");
    }
    return Object.freeze(result);
}
