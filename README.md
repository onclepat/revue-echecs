# Revue

Outil personnel de revue de parties d'échecs Chess.com. Il tourne entièrement dans le navigateur : le moteur d'échecs, les analyses et les données restent sur l'appareil.

## Lancer l'outil

```bash
npm start
```

Puis ouvrir http://localhost:8770. Le dossier `app/` est un site statique : il peut être déposé tel quel chez un hébergeur de fichiers (GitHub Pages, par exemple).

## Lancer les tests

```bash
npm test
```

Les tests utilisent le même moteur que le navigateur. Ils sont à relancer après toute mise à jour d'une dépendance.

## Organisation

```
app/                  le site (seul dossier à publier)
  index.html
  css/app.css         styles et thèmes clair / sombre
  js/
    main.js           état de l'application, liaison entre les modules
    config.js         réglages : budget du moteur, cadences importées
    core/             logique pure, testée, sans accès au navigateur
      eval.js         chances de gain, classes de coups, précision
      pgn.js          lecture d'une partie Chess.com (coups, pendules)
      uci.js          dialogue avec le moteur
      analysis.js     analyse d'une partie, une fiche par coup
      explain.js      explications : uniquement des faits vérifiés
      review.js       moments clés, résumé, prompt pour une IA
    engine/           groupe de moteurs dans des Web Workers
    data/             Chess.com, historique chargé mois par mois, stockage local (IndexedDB)
    ui/               échiquier, panneau, graphique, thème, sons
  tests/              tests automatiques (node --test)
  vendor/             dépendances figées, copiées dans le projet
tools/serve.mjs       serveur local de développement
mvp/                  prototype V2, conservé comme référence
```

## Principes

- **Reproductible.** Chaque position est analysée avec un budget de calcul fixe : la même partie donne toujours le même résultat.
- **Prudent.** Un coup présumé fautif est mesuré une seconde fois dans sa position d'origine ; la perte la plus faible des deux mesures est retenue.
- **Honnête.** Une explication n'est affichée que si elle est établie par les lignes du moteur (mat, matériel, menace non parée). Sinon l'outil dit qu'il ne sait pas.
- **Sans compilation.** Le code publié est le code écrit : JavaScript natif, aucun framework.

## Dépendances

| Dépendance | Version | Licence | Rôle |
|---|---|---|---|
| [stockfish.js](https://github.com/nmrugg/stockfish.js) | 19.0.1, variante légère à un fil | GPL-3.0 | moteur d'échecs |
| [chess.js](https://github.com/jhlywa/chess.js) | 1.4.0 | BSD-2-Clause | règles du jeu |
| Pièces « cburnett » (Colin M.L. Burnett, via Lichess) | — | GPL-2.0-or-later | dessin des pièces |

Mettre à jour une dépendance : remplacer ses fichiers dans `app/vendor/`, relancer `npm test`, et incrémenter `ANALYSIS_VERSION` dans `app/js/config.js` si le moteur change.

## Licence

GPL-3.0-or-later, imposée par le moteur Stockfish.
