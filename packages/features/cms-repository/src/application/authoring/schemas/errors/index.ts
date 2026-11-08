import {
    messageErrorSchema,
    publicationRecoverySchema,
    publicationRefusalSchema,
} from "cms-repository/application/authoring/schemas/errors/models";
export const authoringErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const publicationErrors = {
    INVALID_INPUT: { retryable: false, output: publicationRefusalSchema },
    CORE_UNAVAILABLE: { retryable: true, output: publicationRecoverySchema },
};
