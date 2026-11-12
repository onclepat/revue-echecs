# Revue

Outil personnel de revue de parties d'échecs Chess.com. Il tourne entièrement dans le navigateur : le moteur d'échecs, les analyses et les données restent sur l'appareil.

## Utiliser l'outil

- **En ligne :** https://onclepat.github.io/revue-echecs/
- **Sur son ordinateur :** `npm start`, puis ouvrir http://localhost:8770 (sous Windows, double-cliquer sur `Lancer.bat`).

## Lancer les tests

```bash
npm test
```

Les tests utilisent les mêmes moteurs que le navigateur. Ils sont à relancer après toute mise à jour d'une dépendance, et s'exécutent automatiquement avant chaque mise en ligne.

## Organisation

```
app/                  le site (seul dossier mis en ligne)
  index.html
  css/app.css         styles et thèmes clair / sombre
  js/
    main.js           état de l'application, liaison entre les modules
    config.js         réglages : choix du moteur, budget de calcul
    core/             logique pure, testée, sans accès au navigateur
      eval.js         chances de gain, classes de coups
      accuracy.js     précision : formule de Lichess, à l'identique
      pgn.js          lecture d'une partie Chess.com (coups, pendules)
      uci.js          dialogue avec le moteur
      analysis.js     analyse d'une partie, une fiche par coup
      labels.js       étiquettes : brillant, coup unique, occasion manquée…
      explain.js      explications : uniquement des faits vérifiés
      review.js       moments clés, résumé, prompt pour une IA
    engine/           groupe de moteurs dans des Web Workers
    data/             Chess.com, historique chargé mois par mois, stockage local (IndexedDB)
    ui/               échiquier, panneau, graphique, thème, sons
  tests/              tests automatiques (node --test)
  vendor/             dépendances figées, copiées dans le projet
tools/serve.mjs       serveur local de développement
.github/workflows/    tests et mise en ligne automatiques
```

## Principes

- **Reproductible.** Chaque position est analysée avec un budget de calcul fixe : la même partie donne toujours le même résultat.
- **Prudent.** Un coup présumé fautif est mesuré une seconde fois dans sa position d'origine ; la perte la plus faible des deux mesures est retenue.
- **Honnête.** Une explication n'est affichée que si elle est établie par les lignes du moteur (mat, matériel, menace non parée). Sinon l'outil dit qu'il ne sait pas.
- **Vérifiable.** La précision suit la formule publique de Lichess ; un test la compare au score officiel de parties Lichess réelles.
- **Sans compilation.** Le code publié est le code écrit : JavaScript natif, aucun framework.

## Moteur

| Appareil | Moteur | Taille |
|---|---|---|
| Ordinateur | Stockfish 19, réseau complet | 99 Mo, téléchargés une fois |
| Téléphone, tablette | Stockfish 19, réseau léger | 1,8 Mo |

Les analyses sont rangées par moteur : celles de l'un ne sont jamais présentées comme celles de l'autre.

## Dépendances

| Dépendance | Version | Licence | Rôle |
|---|---|---|---|
| [stockfish.js](https://github.com/nmrugg/stockfish.js) | 19.0.1, variantes à un fil | GPL-3.0 | moteur d'échecs |
| [chess.js](https://github.com/jhlywa/chess.js) | 1.4.0 | BSD-2-Clause | règles du jeu |
| Pièces « cburnett » (Colin M.L. Burnett, via Lichess) | — | GPL-2.0-or-later | dessin des pièces |

Mettre à jour une dépendance : remplacer ses fichiers dans `app/vendor/`, relancer `npm test`, et incrémenter `ANALYSIS_VERSION` dans `app/js/config.js` si le moteur change.

## Licence

GPL-3.0-or-later, imposée par le moteur Stockfish. Voir `LICENSE`.
