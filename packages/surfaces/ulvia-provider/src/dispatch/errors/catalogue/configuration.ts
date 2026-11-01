export const configurationMessages = {
    "auth.email": ["The supplied email address is invalid.", "L’adresse e-mail fournie est invalide."],
    "auth.password": [
        "The password must contain at least {min} characters.",
        "Le mot de passe doit contenir au moins {min} caractères.",
    ],
    "auth.token": [
        "The confirmation or password reset link is invalid or has expired.",
        "Le lien de confirmation ou de réinitialisation du mot de passe est invalide ou a expiré.",
    ],
    "smtp.sender": [
        "A valid sender email address is required to enable delivery.",
        "Une adresse e-mail d’expéditeur valide est obligatoire pour activer l’envoi.",
    ],
    "smtp.reply": ["The reply-to email address is invalid.", "L’adresse e-mail de réponse est invalide."],
    "smtp.credentials": [
        "The SMTP connection settings are incomplete.",
        "Les informations de connexion SMTP sont incomplètes.",
    ],
    "smtp.port": [
        "The SMTP port must be an integer between 1 and 65535.",
        "Le port SMTP doit être un entier compris entre 1 et 65535.",
    ],
    "smtp.invalid": [
        "The SMTP configuration contains invalid information.",
        "La configuration SMTP contient des informations invalides.",
    ],
    "file.size": [
        "The file size must be between 0 and {max} bytes.",
        "La taille du fichier doit être comprise entre 0 et {max} octets.",
    ],
    "file.mime": ["The file content type is invalid.", "Le type de contenu du fichier est invalide."],
    "file.expiry": [
        "The expiration date must be a valid future date.",
        "La date d’expiration doit être une date future valide.",
    ],
    "file.binary": [
        "The file data is missing from the upload request.",
        "Les données du fichier sont absentes de la demande de téléversement.",
    ],
    "permissions.invalid": [
        "The access key permission list is invalid.",
        "La liste des permissions de la clé d’accès est invalide.",
    ],
    "connection.invalid": [
        "The connection configuration is invalid.",
        "Les informations de configuration de la connexion sont invalides.",
    ],
} as const;
