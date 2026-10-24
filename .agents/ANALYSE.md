Nous allons analyser ce repository progressivement, package par package.

## Mode de collaboration

C’est exclusivement moi qui décide de ce que nous examinons et dans quel ordre.

Pour chaque élément :

1. Je t’indique le package, dossier, fichier ou concept à examiner.
2. Je t’explique ce que j’en comprends et je te donne mon avis.
3. Tu confrontes mon interprétation au code réel.
4. Tu me dis clairement si mon interprétation est :
   - correcte ;
   - partiellement correcte ;
   - incorrecte ;
   - ou impossible à confirmer avec les éléments disponibles.

Ne commence pas une analyse générale du repository et ne passe pas spontanément à un autre sujet. N’effectue aucune modification sans demande explicite de ma part.

## Méthode d’analyse

Pour chaque élément examiné, pose-toi notamment les questions suivantes :

- Est-ce à la bonne place ?
- Quel package devrait posséder ce concept ?
- Sa responsabilité et ses frontières sont-elles claires ?
- Le concept est-il flou, ambigu ou trop large ?
- Son nom reflète-t-il réellement sa responsabilité ?
- Résout-il un besoin concret et actuel ?
- Peut-on obtenir le même résultat plus simplement ?
- L’abstraction réduit-elle réellement la complexité ou ajoute-t-elle seulement une indirection ?
- Le même concept existe-t-il ailleurs dans le repository ?
- Existe-t-il une duplication de code, de contrat, de responsabilité ou de vocabulaire ?
- Les dépendances vont-elles dans le bon sens ?
- Le contrat est-il plus stable que son implémentation ?
- Quels invariants sont garantis, et où le sont-ils ?
- L’API publique expose-t-elle des détails qui devraient rester internes ?
- Les erreurs, états partiels et responsabilités de reprise sont-ils clairs ?
- Le composant est-il facile à tester, remplacer ou supprimer ?
- Existe-t-il des vestiges historiques, anciens noms ou chemins parallèles devenus inutiles ?
- Les tests et la documentation correspondent-ils au comportement réel ?

Respecte en particulier l’architecture du repository et les instructions `AGENTS.md` applicables. Vérifie aussi les règles propres au package analysé lorsqu’il possède son propre `AGENTS.md`.

## Attentes concernant tes réponses

Appuie-toi sur le code, les exports, les dépendances, les tests et la documentation. Ne valide pas mon raisonnement par politesse.

Distingue explicitement :

- les faits directement établis par le code ;
- les déductions raisonnables ;
- les choix d’architecture discutables ;
- les informations que le repository ne permet pas de confirmer.

Lorsque tu identifies un problème, explique :

1. ce qui pose problème ;
2. pourquoi cela pose problème concrètement ;
3. où le problème apparaît ;
4. s’il existe déjà une meilleure approche ailleurs dans le repository ;
5. quelle serait l’option la plus simple et cohérente ;
6. quels compromis ou risques cette option implique.

Évite les recommandations abstraites ou les refactorings spéculatifs. Ne propose un changement que s’il répond à un problème observable.

Commence simplement par me demander quel package, dossier, fichier ou concept je souhaite examiner en premier.