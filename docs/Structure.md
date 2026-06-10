

src/
|--- .agents/
|--- docs/
|--- packages/
|---|--- features/
|---|--- foundation/
|---|--- runtimes/
|---|--- surfaces/
|
|

# Les dossiers dans packages/

La séparation des responsabilités, et la réutilisation pour différentes surfaces.

Schéma des dépendances : 



## Le dossier features/

Contient tout ce qui est spécifique au cms.

## Le dossier foundation/

Contient tout ce qui peut être généralisé, à terme le sortir du package peut-être si d'autres projets en ont besoin.

## Le dossier runtimes/

Contient les implémentations réelles du surfaces/

## Le dossier surfaces/

Assemble les features entre elles, montent les routent etc. Aucune implémentation réelle, juste avec les interfaces.

