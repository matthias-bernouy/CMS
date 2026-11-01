export const defaultsMessages = {
    "CORE_UNAVAILABLE": [
        "The service is temporarily unavailable. Try again later.",
        "Le service est temporairement indisponible. Réessayez plus tard.",
    ],
    "INVALID_INPUT": [
        "Some of the supplied information is invalid.",
        "Certaines informations fournies sont invalides.",
    ],
    "INVALID_PAGE": ["The page contains invalid information.", "La page contient des informations invalides."],
    "INVALID_TITLE": ["The Page title is invalid.", "Le titre de la page est invalide."],
    "INVALID_SITE_BLOC": ["The site Bloc definition is invalid.", "La définition du bloc de site est invalide."],
    "NOT_FOUND": ["This resource could not be found.", "Cette ressource est introuvable."],
    "FORBIDDEN": [
        "You are not authorized to perform this operation.",
        "Vous n’êtes pas autorisé à effectuer cette opération.",
    ],
    "NOT_AUTHORIZED": [
        "You are not authorized to access this resource.",
        "Vous n’êtes pas autorisé à accéder à cette ressource.",
    ],
    "REVISION_CONFLICT": [
        "The data changed since it was loaded. Reload it before trying again.",
        "Les données ont été modifiées depuis leur chargement. Rechargez-les avant de réessayer.",
    ],
    "RATE_LIMITED": [
        "Too many requests have been made. Try again later.",
        "Trop de demandes ont été effectuées. Réessayez plus tard.",
    ],
    "INVALID_CREDENTIALS": [
        "The email address or password is incorrect.",
        "L’adresse e-mail ou le mot de passe est incorrect.",
    ],
    "ACTOR_UNAVAILABLE": [
        "Your identity could not be verified. Sign in again before retrying.",
        "Votre identité n’a pas pu être vérifiée pour cette opération. Reconnectez-vous puis réessayez.",
    ],
    "CANNOT_REMOVE_SELF": [
        "You cannot remove your own account or administrator access through this operation.",
        "Vous ne pouvez pas supprimer votre propre compte ou retirer vos droits d’administration depuis cette opération.",
    ],
    "PROTECTED_USER": [
        "This account is protected and cannot be deleted.",
        "Ce compte est protégé et ne peut pas être supprimé.",
    ],
    "PAGE_REFERENCED": [
        "This Page is still referenced. Remove its references before deleting it.",
        "Cette page est encore référencée. Retirez les références avant de la supprimer.",
    ],
    "PATH_CONFLICT": [
        "Another Page already uses this address. Choose another address.",
        "Une autre page utilise déjà cette adresse. Choisissez une autre adresse.",
    ],
    "TAG_CONFLICT": ["This Bloc identifier is already in use.", "Cet identifiant de bloc est déjà utilisé."],
} as const;
