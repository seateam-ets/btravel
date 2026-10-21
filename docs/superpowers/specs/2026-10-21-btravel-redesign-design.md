# B-TRAVEL Site et administration : spécification de conception

## Objectif

Refondre le site public de B-TRAVEL et créer une administration simple, privée et reliée au même système de données. La première mise en ligne doit comprendre les quinze fonctions métier du cahier des charges, sans transformer l’administration en ERP complexe.

La responsable utilise actuellement beaucoup le papier et doit pouvoir accomplir ses tâches courantes sans ressaisir les mêmes informations. Le site public doit présenter clairement les services, rassurer les visiteurs et générer des demandes de devis.

## Décisions confirmées

- Une application intégrée, avec site public, administration protégée, API et base de données commune.
- Site public et administration en français au lancement.
- Les quinze fonctions métier du cahier des charges doivent être disponibles au lancement.
- Une seule responsable se connecte au départ. L’architecture doit permettre d’ajouter des comptes et des droits ultérieurement.
- La responsable utilise principalement un ordinateur. L’administration reste utilisable sur tablette et mobile.
- Les demandes de transport suivent le parcours demande, devis, réponse client enregistrée par B-TRAVEL, réservation, affectations, fiche de mission et facturation.
- Les demandes de devis du site et les demandes saisies après un appel téléphonique arrivent dans la même administration.
- Les réservations aux voyages organisés sont des demandes : B-TRAVEL confirme les places et suit les paiements, sans paiement en ligne immédiat.
- Pour une demande de places, le site demande le contact responsable et le nombre de places. Les noms des passagers sont enregistrés après confirmation.
- Le planning gère les transports ponctuels et les trajets scolaires récurrents. Les périodes de congés scolaires suspendent ces derniers, avec dates modifiables.
- Les factures peuvent être émises par l’administration après validation préalable des règles applicables avec le comptable.
- Le tableau de bord met d’abord en avant les demandes et devis, ensuite les transports et fiches de mission, puis les voyages et inscriptions.
- La migration se limite aux pages, photos et voyages à venir. Les anciens dossiers clients, demandes, réservations et documents ne sont pas migrés.

## Architecture

Le projet existant fournit un socle TypeScript, React/Vite pour les applications web, Express pour l’API, et PostgreSQL avec Drizzle pour les données. La conception ajoute une application web B-TRAVEL qui sert le site public et les routes privées de l’administration. Les données métier sont gérées par l’API existante et une base partagée.

Les contenus publiés (pages, flotte et voyages publiés) peuvent être lus par les visiteurs. Les données métier (clients, demandes, devis, réservations, affectations, documents, factures et paiements) ne sont accessibles qu’aux comptes autorisés. La partie publique ne reçoit jamais de droits d’administration.

L’authentification doit utiliser une solution sécurisée compatible avec Replit, avec ouverture de compte contrôlée, récupération de compte, sessions protégées et possibilité d’ajouter plus tard des rôles distincts. Il n’y a pas d’inscription publique à l’administration. Le fournisseur exact sera choisi lors du plan technique.

Les demandes et les réservations doivent être enregistrées durablement avant qu’un message de confirmation soit affiché. Une panne de notification ne doit pas perdre une demande. L’administratrice doit recevoir une notification des nouvelles demandes ; le fournisseur d’envoi et l’adresse destinataire restent à choisir et vérifier avant l’activation des e-mails.

## Site public

### Navigation

- Accueil
- Nos services : scolaires, groupes et associations, entreprises, événements, excursions et voyages
- Notre flotte
- Voyages organisés
- À propos
- Demander un devis
- Contact
- Pages légales et informations pratiques, après vérification de leur contenu

Les pages seront accessibles sur ordinateur et mobile, structurées pour le référencement, rapides à charger, utilisables au clavier et rédigées en français. Les URL utiles du site actuel seront conservées autant que possible. Les URL modifiées feront l’objet de redirections quand le domaine et le plan de mise en ligne seront confirmés.

La direction visuelle s’inspirera du niveau de finition, de la mise en valeur des véhicules, des images immersives et de la hiérarchie de Scout Motors. Il ne s’agit pas de copier ses pages, sa marque ni ses médias. L’identité de B-TRAVEL, son logo et ses visuels propres resteront prioritaires.

La direction artistique définitive et les maquettes attendent le questionnaire rempli par la cliente et les éventuels autres liens ou ressources graphiques. Les propositions déjà évoquées restent provisoires.

### Devis

Le formulaire en plusieurs étapes reprend les informations du cahier des charges et les champs présents sur le site actuel :

- nom et prénom, organisme le cas échéant, e-mail, téléphone et adresse utile à la facturation ;
- type de transport, trajet simple ou aller-retour ;
- date(s), horaires, départ, destination et nombre de passagers ;
- remarques complémentaires.

À la soumission, l’API valide et enregistre la demande, lui attribue un statut initial et la rend visible dans l’administration. Le visiteur reçoit une confirmation seulement après l’enregistrement réussi. Les erreurs sont explicites et le formulaire reste récupérable en cas d’échec.

### Voyages organisés

Le site affiche seulement les voyages publiés par B-TRAVEL. Chaque fiche peut présenter destination, date, programme, tarifs, points et heures de départ, disponibilité, informations pratiques et modalités de demande de réservation, selon les informations validées par B-TRAVEL.

Le visiteur soumet ses coordonnées et le nombre de places souhaitées. L’administration reçoit une demande à confirmer. Après confirmation, la responsable peut renseigner les passagers et leur suivi de paiement. Le site ne débite pas les voyageurs.

Les dates, prix, places restantes et trajets de départ ne doivent pas être inventés. Les valeurs affichées doivent provenir d’informations enregistrées et validées.

## Administration

### Navigation

Les fonctions sont regroupées dans :

1. **Accueil** : demandes récentes, devis à suivre, prochains transports, rappels, tâches et statistiques simples.
2. **Demandes et devis** : demandes en ligne ou saisies manuellement, dossiers, création de devis, PDF, envoi et suivi de réponse.
3. **Planning des trajets** : vues jour, semaine et mois, transports ponctuels, trajets récurrents, réservations, affectations et fiches de mission.
4. **Clients** : coordonnées, recherche rapide, historique de demandes, devis, transports et factures.
5. **Facturation** : création depuis une réservation, acomptes, factures, paiements, échéances, impression et export.
6. **Voyages organisés** : création et publication de voyages, programme, dates, tarifs, capacité, demandes, inscriptions et liste imprimable de passagers.
7. **Paramètres** : véhicules, chauffeurs, utilisateurs et configuration.

### Quinze fonctions couvertes

| Fonction du cahier des charges | Domaine |
| --- | --- |
| Tableau de bord | Accueil |
| Gestion des demandes, y compris saisie après appel | Demandes et devis |
| Création, PDF et suivi des devis | Demandes et devis |
| Planning jour, semaine et mois | Planning des trajets |
| Répertoire et historique clients | Clients |
| Transformation d’un devis accepté en réservation | Demandes, devis et planning |
| Véhicules, disponibilités, capacité et conflits | Paramètres et planning |
| Chauffeurs, disponibilités et conflits | Paramètres et planning |
| Fiches de mission imprimables | Planning des trajets |
| Factures, acomptes, paiements, exports | Facturation |
| Rappels et tâches avec statut terminé | Accueil |
| Création, modification et publication de voyages | Voyages organisés |
| Inscriptions, places, paiements et listes passagers | Voyages organisés |
| Centralisation et impression des documents | Fiches clients et dossiers métier |
| Statistiques simples | Accueil |

### Ergonomie et règles métier

L’administration doit être en français, lisible, rassurante et utilisable sans jargon. Les actions principales portent des libellés explicites. Les formulaires évitent les champs obligatoires inutiles. Les données déjà connues d’une demande ou d’un devis sont réutilisées jusqu’à la réservation, à la mission et à la facture. Les boutons et commandes doivent avoir un fonctionnement réel ; aucune action fictive ne doit être affichée.

Les suppressions exigent une confirmation. Les messages de sauvegarde, d’erreur et de confirmation restent compréhensibles. Les principaux documents peuvent être imprimés. Les statistiques se limitent aux indicateurs du cahier des charges.

La détection des conflits doit s’appuyer sur les horaires, les disponibilités enregistrées et les capacités des véhicules. Une affectation incompatible doit être signalée avant confirmation, sans être silencieusement acceptée.

Les règles de numérotation, d’émission et de conformité des factures ne seront finalisées qu’après validation du comptable. Aucun connecteur comptable n’est actuellement choisi. Les paiements des voyages sont suivis dans l’administration, sans traitement de paiement en ligne.

## Données et migrations

Les entités principales sont les clients, demandes de transport, devis, transports et récurrences, réservations, véhicules, chauffeurs, affectations, fiches de mission, factures, paiements, tâches, voyages, demandes de places, passagers, documents et utilisateurs.

La source de migration est le site public actuel : pages retenues, photos utilisables et voyages à venir. Les données doivent être revues par B-TRAVEL avant publication. Les anciennes données commerciales, clients, réservations et documents sont exclues de la migration. Les données opérationnelles de flotte et de chauffeurs seront créées ou saisies séparément ; leurs listes complètes ne sont pas encore disponibles dans le projet.

Les pages de test, données d’exemple et contenus passés ne doivent pas être importés comme données de production. Les images et témoignages sont réutilisés seulement après confirmation des droits et de leur actualité.

## Sécurité, données et qualité

- Contrôler chaque route d’administration côté serveur, en plus de protéger son affichage côté navigateur.
- Valider les entrées du site public et les données persistées.
- Limiter les données personnelles à ce qui est nécessaire au transport, à la facturation ou aux inscriptions.
- Protéger les sessions et documents privés ; exclure les secrets et mots de passe des journaux et des réponses publiques.
- Prévoir sauvegardes, exports, gestion d’erreurs compréhensible et tests de restauration avant la mise en production.
- Définir avec B-TRAVEL la durée de conservation et le traitement RGPD des demandes, documents et données passagers avant mise en production.
- Vérifier les parcours complets : devis public enregistré, devis saisi manuellement, transformation en transport, affectations, conflits, fiche de mission imprimée, demande d’inscription, confirmation, saisie des passagers, paiement et facture.
- Vérifier aussi les permissions, erreurs d’enregistrement, appareils mobiles, impression, SEO, redirections, voyages indisponibles et prévention des doubles soumissions.
- Vérifier l’accessibilité clavier, les libellés de formulaires, les contrastes, les performances mobiles et le comportement sur les navigateurs courants.
- Aucune donnée factice ne doit rester dans l’environnement de production.

## Points ouverts avant mise en production ou direction artistique

- **Questionnaire cliente et références visuelles** : attendus avant la validation de l’identité visuelle et la création des maquettes.
- **Adresse de production** : l’utilisateur n’a pas encore décidé si le nouveau site utilisera `b-travel.be` ou une autre adresse. Ne pas configurer de bascule ni de redirection globale avant confirmation.
- **Comptable** : confirmer le logiciel ou les exigences de facturation électronique, la numérotation, les règles fiscales, les acomptes et les formats d’export.
- **Notifications e-mail** : sélectionner un fournisseur, confirmer l’adresse destinataire et valider le contenu des messages avant envoi.
- **Contenus et ressources** : confirmer les textes, photos, tarifs, capacités, horaires, voyages à venir et droits d’utilisation.
- **Flotte et chauffeurs** : collecter les capacités, équipements, disponibilités et données nécessaires à l’affectation et aux contrôles de conflit.
- **Conditions et pages légales** : faire vérifier les textes existants avant réutilisation.
- **Voyages et newsletter** : une newsletter apparaît sur le site actuel, mais elle n’est pas dans le périmètre approuvé pour la première version ; confirmer séparément si elle doit être conservée.
- **Mise en ligne** : aucune date cible n’est fixée. La publication et la modification du site actuel ne sont pas incluses dans ce cadrage.
