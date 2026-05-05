
export type ValidateInputResponse = {
    valid: boolean;
    message?: string;
    errors: {
        [name]: string
    }
}