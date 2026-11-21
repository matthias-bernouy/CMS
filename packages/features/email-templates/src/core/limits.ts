/** String bounds use UTF-16 code units; JSON bounds use serialized UTF-8 bytes. */
export const TEMPLATE_LIMITS = Object.freeze({
    sourceSubjectMaxCodeUnits: 500,
    sourceBodyMaxCodeUnits: 32768,
    variableCount: 32,
    variableValueMaxCodeUnits: 8192,
    sourceJsonMaxBytes: 65536,
    renderedSubjectMaxCodeUnits: 998,
    renderedBodyMaxCodeUnits: 131072,
    renderedJsonMaxBytes: 262144,
});
