export const MAX_PERSONAL_ACCESS_TOKENS = 32;

export class PersonalAccessTokenLimitError extends Error {
    constructor() {
        super("Personal access token limit reached");
    }
}
