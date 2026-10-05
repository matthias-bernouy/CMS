type CredentialsInput = {
    email?: string;
    password?: string;
    returnTo?: string;
};

export async function readCredentials(req: Request): Promise<CredentialsInput> {
    const url = new URL(req.url);
    let returnTo = url.searchParams.get("returnTo") ?? undefined;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        const bytes = await readBoundedRequestBody(req, MAX_AUTH_REQUEST_BYTES);
        const body = parseObject(bytes);
        return {
            email: typeof body.email === "string" ? body.email : undefined,
            password: typeof body.password === "string" ? body.password : undefined,
            returnTo: typeof body.returnTo === "string" ? body.returnTo : returnTo,
        };
    }

    const form = await readBoundedFormData(req, MAX_AUTH_REQUEST_BYTES).catch((error) => {
        if ((error as { status?: unknown })?.status === 413) {
            throw error;
        }
        return null;
    });
    if (!form) {
        return { returnTo };
    }
    if (form.get("returnTo")) {
        returnTo = String(form.get("returnTo"));
    }
    return {
        email: formString(form.get("email")),
        password: formString(form.get("password")),
        returnTo,
    };
}

function parseObject(bytes: Uint8Array): Record<string, unknown> {
    try {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function formString(value: FormDataEntryValue | null): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
import { readBoundedFormData, readBoundedRequestBody } from "@bernouy/http-runner";
import { MAX_AUTH_REQUEST_BYTES } from "cms-auth/application/http/input/requestInput";
