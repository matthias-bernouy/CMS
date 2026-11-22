export const formsMessages = {
    FORM_NOT_FOUND: ["This form has no available publication.", "Ce formulaire n’a pas de publication disponible."],
    FORM_CLOSED: ["This form is not accepting submissions.", "Ce formulaire n’accepte pas de réponses actuellement."],
    VERSION_CONFLICT: [
        "This form changed. Reload its current publication before submitting.",
        "Ce formulaire a changé. Rechargez sa publication actuelle avant de répondre.",
    ],
    SUBMISSION_NOT_ALLOWED: [
        "This submission does not match the form's access mode.",
        "Cette réponse ne correspond pas au mode d’accès du formulaire.",
    ],
    SUBMISSION_GONE: [
        "This submission is unavailable or its retention period expired.",
        "Cette réponse n’est pas disponible ou sa durée de conservation est dépassée.",
    ],
    EMAILER_UNAVAILABLE: [
        "A compatible Emailer must be selected before publishing notifications.",
        "Un Emailer compatible doit être sélectionné avant de publier les notifications.",
    ],
} as const;
