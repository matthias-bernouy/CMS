export const accountFieldLabels = {
    "given-name": "First name",
    surname: "Name",
    "birth-date": "Birth date",
    email: "Email address",
    phone: "Phone",
    "address-line-1": "Address",
    "address-line-2": "Address line 2",
    "address-line-3": "Address line 3",
    "postal-code": "Postal code",
    city: "City",
    region: "Region / state",
    "country-code": "Country code",
    locale: "Language",
    timezone: "Time zone",
    avatar: "Profile picture",
};

export const accountMessages = {
    "avatar-uploading-label": "Uploading image…",
    "avatar-error-message": "The profile picture could not be updated.",
    "load-error-message": "Your personal information could not be loaded.",
    "success-message": "Information saved.",
    "save-error-message": "Your information could not be saved.",
};

export const accountFields = Object.keys(accountFieldLabels);
export const accountCopyAttributes = [
    ...accountFields.map((field) => `${field}-label`),
    ...Object.keys(accountMessages),
    "loading-label",
    "avatar-hint",
];
