export const fieldsMessages = {
    "field.invalid": ["The value of field “{field}” is invalid.", "La valeur du champ « {field} » est invalide."],
    "field.required": ["Field “{field}” is required.", "Le champ « {field} » est obligatoire."],
    "field.empty": ["Field “{field}” cannot be empty.", "Le champ « {field} » ne peut pas être vide."],
    "field.too_long": [
        "Field “{field}” exceeds the limit of {max} characters.",
        "Le champ « {field} » dépasse la limite de {max} caractères.",
    ],
    "field.characters": [
        "Field “{field}” contains prohibited characters.",
        "Le champ « {field} » contient des caractères interdits.",
    ],
    "field.text": ["Field “{field}” must contain text.", "Le champ « {field} » doit contenir du texte."],
    "field.object": ["Field “{field}” must be an object.", "Le champ « {field} » doit être un objet."],
    "field.boolean": ["Field “{field}” must be a boolean.", "Le champ « {field} » doit être un booléen."],
    "field.unsupported": ["Field “{field}” is not supported.", "Le champ « {field} » n’est pas pris en charge."],
    "page.title_empty": ["The Page title cannot be empty.", "Le titre de la page ne peut pas être vide."],
    "page.title_long": [
        "The Page title exceeds the limit of {max} characters.",
        "Le titre de la page dépasse la limite de {max} caractères.",
    ],
    "page.title_characters": [
        "The Page title contains prohibited characters.",
        "Le titre de la page contient des caractères interdits.",
    ],
    "page.content_long": [
        "The Page content exceeds the limit of {max} characters.",
        "Le contenu de la page dépasse la limite de {max} caractères.",
    ],
    "page.tag_long": [
        "Tag “{tag}” exceeds the limit of {max} characters.",
        "L’étiquette « {tag} » dépasse la limite de {max} caractères.",
    ],
    "page.tag_invalid": [
        "Tag “{tag}” contains prohibited characters.",
        "L’étiquette « {tag} » contient des caractères interdits.",
    ],
    "page.tags_many": [
        "A Page cannot have more than {max} tags.",
        "Une page ne peut pas avoir plus de {max} étiquettes.",
    ],
    "page.no_change": [
        "The update must contain at least one change.",
        "La mise à jour doit contenir au moins une modification.",
    ],
    "page.path_invalid": [
        "The Page address must be a valid public path outside reserved CMS routes.",
        "L’adresse de la page doit être un chemin public valide en dehors des routes réservées au CMS.",
    ],
    "page.path_reserved": [
        "This address is reserved by the CMS. Choose another address.",
        "Cette adresse est réservée au CMS. Choisissez une autre adresse.",
    ],
    "page.default_language": [
        "Configure the default site language before defining Page addresses.",
        "Configurez la langue principale du site avant de définir les adresses des pages.",
    ],
    "page.primary_path": [
        "An address is required for the default site language.",
        "Une adresse est obligatoire pour la langue principale du site.",
    ],
    "language.unconfigured": [
        "Language “{language}” is not configured for this site.",
        "La langue « {language} » n’est pas configurée pour ce site.",
    ],
    "language.duplicate": [
        "Language “{language}” appears more than once.",
        "La langue « {language} » apparaît plusieurs fois.",
    ],
    "language.invalid": [
        "Language identifier “{language}” is invalid.",
        "L’identifiant de langue « {language} » est invalide.",
    ],
    "seo.shape": [
        "SEO information must be organized by language, with at most {max} languages.",
        "Les informations SEO doivent être organisées par langue, avec au maximum {max} langues.",
    ],
    "seo.entry": [
        "SEO information for “{language}” must contain only a title and description.",
        "Les informations SEO en « {language} » doivent contenir uniquement un titre et une description.",
    ],
    "seo.title_long": [
        "The SEO title for “{language}” exceeds the limit of {max} characters.",
        "Le titre SEO en « {language} » dépasse la limite de {max} caractères.",
    ],
    "seo.description_long": [
        "The SEO description for “{language}” exceeds the limit of {max} characters.",
        "La description SEO en « {language} » dépasse la limite de {max} caractères.",
    ],
} as const;
