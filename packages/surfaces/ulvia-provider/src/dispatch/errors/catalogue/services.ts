export const servicesMessages = {
    "REJECTED": [
        "The Repository refused this request. Check namespace ownership, the current revision and the submitted data.",
        "Le Repository a refusé cette demande. Vérifiez la propriété du namespace, sa révision actuelle et les données envoyées.",
    ],
    "TOKEN_LIMIT": [
        "This account has reached its personal access token limit. Revoke an unused token before creating another.",
        "Ce compte a atteint sa limite de jetons personnels. Révoquez un jeton inutilisé avant d’en créer un autre.",
    ],
    "ALREADY_EXISTS": [
        "A secret with this name already exists in this namespace.",
        "Un secret portant ce nom existe déjà dans cet espace.",
    ],
    "VERSION_CONFLICT": [
        "This secret changed since it was loaded. Reload its metadata before retrying.",
        "Ce secret a été modifié depuis son chargement. Rechargez ses métadonnées avant de réessayer.",
    ],
    "EMAIL_DISABLED": [
        "Email delivery is disabled for this instance.",
        "L’envoi d’e-mails est désactivé pour cette instance.",
    ],
    "QUOTA_EXCEEDED": [
        "This namespace has exceeded its storage quota. Free some space before retrying.",
        "Le quota de stockage de cet espace est dépassé. Libérez de l’espace avant de réessayer.",
    ],
    "SIZE_MISMATCH": [
        "The received data does not match the announced size. Restart the upload.",
        "La taille des données reçues ne correspond pas à la taille annoncée. Recommencez le téléversement.",
    ],
    "UPLOAD_NOT_READY": [
        "The upload is not ready to complete. Check that all file data has been sent.",
        "Le téléversement n’est pas prêt à être finalisé. Vérifiez que l’envoi du fichier est terminé.",
    ],
    "RANGE_NOT_SATISFIABLE": [
        "The requested byte range is not available for this file.",
        "La plage d’octets demandée n’est pas disponible pour ce fichier.",
    ],
    "BROWSER_CAPABILITIES_APPROVAL_REQUIRED": [
        "This collection requires browser permissions that must be approved before continuing.",
        "Cette collection demande des autorisations navigateur qui doivent être approuvées avant de continuer.",
    ],
    "CATALOGUE_TOO_LARGE": [
        "The collection catalogue exceeds the supported limit. Reduce the consulted sources.",
        "Le catalogue de collections dépasse la limite prise en charge. Réduisez les sources consultées.",
    ],
    "IDEMPOTENCY_CONFLICT": [
        "This operation key has already been used for a different request.",
        "Cette clé d’opération a déjà été utilisée avec une demande différente.",
    ],
    "INVALID_SELECTION": [
        "The selected contract and Provider cannot be used for this operation.",
        "La sélection du contrat et du provider n’est pas valide.",
    ],
    "INVALID_STATE": [
        "The current installation state does not allow this operation.",
        "L’état actuel de cette installation ne permet pas cette opération.",
    ],
    "RELEASE_MISMATCH": [
        "The available release does not match the expected release. Refresh the catalogue and recreate the plan.",
        "La release disponible ne correspond pas à la release attendue. Actualisez le catalogue et recréez le plan.",
    ],
    "UPGRADE_IN_PROGRESS": [
        "An upgrade is already in progress. Wait until it finishes before continuing.",
        "Une mise à jour est déjà en cours. Attendez sa fin avant de continuer.",
    ],
    "ENTRY_CONFLICT": [
        "A log entry with this identifier already exists with different content.",
        "Une entrée de journal portant cet identifiant existe déjà avec un contenu différent.",
    ],
    "INVALID_CURSOR": [
        "The pagination cursor is invalid or does not match this search. Restart the search.",
        "Le curseur de pagination est invalide ou ne correspond pas à cette recherche. Relancez la recherche.",
    ],
    "INSTANCE_UNAVAILABLE": [
        "The CMS instance associated with this connection is unavailable.",
        "L’instance CMS associée à cette connexion est indisponible.",
    ],
    "OPERATION_FAILED": [
        "The operation failed. Check its state before deciding to run it again.",
        "L’opération a échoué. Consultez son état avant de décider de la relancer.",
    ],
    "OPERATION_HANDLER_UNAVAILABLE": [
        "The handler required for this operation is no longer available.",
        "Le traitement nécessaire à cette opération n’est plus disponible.",
    ],
} as const;
