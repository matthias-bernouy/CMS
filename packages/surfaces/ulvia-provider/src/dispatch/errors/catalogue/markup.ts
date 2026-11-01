export const markupMessages = {
    "page.multiple_h1": [
        "The Page can display multiple H1 headings. It must display at most one.",
        "La page peut afficher plusieurs titres H1. Elle doit en afficher au maximum un.",
    ],
    "page.repeated_h1": [
        "An H1 heading is inside a repeated region and could appear multiple times.",
        "Un titre H1 se trouve dans une zone répétée et pourrait apparaître plusieurs fois.",
    ],
    "page.heading_skip": [
        "The heading hierarchy skips from H{previous} to H{next}. Add the intermediate levels.",
        "La hiérarchie des titres passe de H{previous} à H{next}. Ajoutez les niveaux intermédiaires.",
    ],
    "page.root_text": [
        "Text at the Page root must belong to a Bloc slot.",
        "Le texte à la racine de la page doit appartenir à un emplacement de bloc.",
    ],
    "page.root_bloc": [
        "Element “{tag}” at the Page root must declare an available Bloc identity.",
        "L’élément « {tag} » à la racine de la page doit déclarer une identité de bloc disponible.",
    ],
    "page.bloc_unknown": [
        "Bloc “{bloc}” is unknown or unavailable in the installed collections.",
        "Le bloc « {bloc} » est inconnu ou indisponible dans les collections installées.",
    ],
    "page.bloc_hidden": [
        "Hidden Bloc “{bloc}” must be placed in a slot that explicitly accepts it.",
        "Le bloc masqué « {bloc} » doit être placé dans un emplacement qui l’accepte explicitement.",
    ],
    "page.html_invalid": [
        "The HTML in field “{field}” does not comply with the CMS rules.",
        "Le contenu HTML du champ « {field} » ne respecte pas les règles du CMS.",
    ],
    "page.html_comments": [
        "HTML comments are not allowed in stored Page content.",
        "Les commentaires HTML ne sont pas autorisés dans le contenu enregistré des pages.",
    ],
    "page.duplicate_id": [
        "HTML identifier “{id}” is used more than once.",
        "L’identifiant HTML « {id} » est utilisé plusieurs fois.",
    ],
    "page.command_missing": [
        "The command references element “{id}”, which could not be found.",
        "La commande référence l’élément « {id} », qui est introuvable.",
    ],
    "page.command_dialog": [
        "The target of this command must be a dialog element.",
        "La cible de cette commande doit être un élément « dialog ».",
    ],
    "page.dialog_name": ["This dialog must have an accessible name.", "Ce dialogue doit définir un nom accessible."],
    "page.label_missing": [
        "The accessible label references element “{id}”, which could not be found.",
        "Le libellé accessible référence l’élément « {id} », qui est introuvable.",
    ],
    "example.request": [
        "The request for this Page example is invalid.",
        "La demande d’accès à cet exemple de page est invalide.",
    ],
    "example.locale": [
        "The requested example language is invalid.",
        "La langue demandée pour cet exemple est invalide.",
    ],
    "example.pagination": [
        "The example pagination or cursor is invalid.",
        "La pagination ou le curseur de la liste d’exemples est invalide.",
    ],
    "example.not_found": [
        "The requested example does not exist in this collection.",
        "L’exemple demandé n’existe pas dans cette collection.",
    ],
    "example.collection": [
        "The collection containing this example is not installed.",
        "La collection contenant cet exemple n’est pas installée.",
    ],
} as const;
