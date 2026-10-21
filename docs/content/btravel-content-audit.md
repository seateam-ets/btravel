# Inventaire du contenu B-TRAVEL

Audit du site public effectué le 21 octobre 2026 à partir des sitemaps WordPress, des pages publiques et des styles Elementor pour identifier les photographies de la flotte.

Les textes extraits des 48 adresses examinées sont conservés dans `btravel-source-inventory.json`. Les données de présentation consolidées sont dans `artifacts/btravel/src/content/site-content.json`.

## Contenu métier à conserver

| Source | Destination |
| --- | --- |
| Accueil | Présentation familiale, plus de 40 ans, sécurité et confort, implantation à Perwez, transports scolaires, navettes événementielles et voyages à l’étranger |
| À propos | Présentation et engagement d’origine, six photographies historiques distinctes |
| Nos véhicules | Treize modèles distincts et leurs treize photographies identifiées dans les styles du site |
| Voyages organisés | Annonce de Cologne et neuf programmes passés, sans réouvrir les réservations des archives |
| Pages `/voyage/` et `/etn/` | Informations complémentaires recoupées, anciens liens conservés par correspondance |
| Devis et Devis/Contact | Coordonnées, organisation, rue et numéro, code postal, ville, TVA, aller simple/retour, dates, heures, effectif, prise en charge, destination et remarques |
| Législation | Texte original complet avec avertissement : contenu historique à vérifier, non utilisable comme validation automatique du planning |
| Termes et conditions | Dix sections de la source, avec avertissement sur la validation juridique et le parcours actuel sans paiement en ligne |
| Pied de page et contact | Siège social, siège d’exploitation, téléphone, fax, e-mail et TVA |
| Partenaires | Province du Brabant wallon et Fédération belge des entrepreneurs de transport par autobus et autocars |
| Avis | Dix avis affichés dans la source, dont quatre comportent un commentaire, présentés comme une reprise historique et non comme une note actualisée |
| Réseaux sociaux | Lien Facebook officiel trouvé dans le HTML du site |
| Newsletter | Invitation et thèmes d’origine ; demande d’inscription par e-mail explicitement indiquée, sans prétendre qu’un service d’envoi est raccordé |

Les pages de listes et de catégories de voyages reprennent les mêmes événements. Elles n’ajoutent pas de programme distinct.

## Programmes identifiés

| Voyage | Date recoupée | Prix publié |
| --- | --- | --- |
| Marché de Noël de Cologne | 12 décembre 2026 | 50 € |
| L’Écluse et Blankenberge | 21 juin 2026 | 50 € |
| Banneux Notre-Dame | 3 mai 2026 | 35 € |
| Parc Astérix | 26 avril 2026 | 89 € adulte, 35 € moins de 3 ans |
| Keukenhof | 28 mars 2026 | 69 € adulte, 35 € moins de 17 ans |
| Valkenburg | 29 novembre 2025 | 39 € |
| Phantasialand | 27 septembre 2025 | 95 € |
| Efteling | 22 mars 2025 | 59 € |
| Nausicaá | 22 février 2025 | 59 € adulte, 52 € moins de 12 ans |
| Village de Noël à Liège | 14 décembre 2024 | 24 € |

Les horaires, arrêts, prestations incluses et descriptions sont repris des pages détaillées. Pour Nausicaá et Liège, les anciennes pages `/voyage/` fournissent des précisions absentes de leur équivalent `/etn/`.

## Incohérences repérées

- Les conditions indiquent le téléphone `+32 10 65 02 01` dans leurs coordonnées, mais un autre numéro manifestement générique dans leur dernière ligne. La présentation consolidée utilise le numéro cohérent avec le reste du site.
- La fiche Eventin de Banneux affiche une période du 31 mars au 31 mai ; la page éditoriale et la liste des voyages indiquent le 3 mai 2026.
- La fiche Eventin de Liège affiche le 1 février 2025 ; la page éditoriale donne le 14 décembre 2024.
- Phantasialand comporte une ancienne mention du 23 juillet et un tarif technique « From €59 », alors que le titre, la date éditoriale et le programme donnent le 27 septembre 2025 et 95 €.
- Les heures techniques Eventin à minuit et le fuseau Europe/Belgrade ne sont pas les horaires des départs. Les horaires du programme sont utilisés.
- Le texte de législation comporte des formulations qui demandent une vérification professionnelle. Sa reprise n’est pas une certification de conformité.
- Les conditions renvoient à une politique de confidentialité qui n’apparaît pas dans les sitemaps examinés. Aucune politique nouvelle n’est inventée.
- La capacité exacte de Cologne n’est pas publiée dans la source. L’annonce publique ne doit pas afficher de disponibilité supposée. La fiche de réservation reste en brouillon jusqu’à confirmation.

## Éléments techniques ou de démonstration non intégrés au nouveau site

Aucun contenu n’est supprimé du site existant. Ces éléments sont conservés dans l’inventaire, mais ne deviennent pas des pages commerciales :

- Les trois articles de démonstration en anglais contenant du « Lorem ipsum » et leur catégorie `Uncategorized`.
- Les pages vides `test`, `etn_category` et `etn-tags`.
- L’événement de démonstration `applied-ai-machine-learning-summit-2026`, qui retourne une page non trouvée.
- Les sept fiches `etn-schedule` : trois pages non trouvées et quatre fiches de démonstration technologique sans contenu métier B-TRAVEL.
- L’adresse `/contact/`, absente du sitemap et bloquée lors de l’extraction. La nouvelle page Contact utilise les coordonnées vérifiées dans les conditions et le pied de page.

## Limites de reprise

- Les photographies sont référencées par leurs URL publiques actuelles. Les fichiers originaux ne sont pas copiés et leur hébergement pérenne doit être réglé avant une éventuelle suppression de l’ancien hébergement.
- Les avis sont un instantané de la source, pas une connexion active à Google.
- La newsletter n’est pas raccordée à un outil de diffusion.
- Les correspondances d’anciennes adresses dans l’application ne constituent pas des redirections HTTP permanentes de production.
- Aucun domaine, paiement, compte administrateur ou service de production n’est modifié par cet audit.

## Vérification de la version intégrée

- Vérification TypeScript du site et compilation de production réussies.
- Rendu de l’accueil vérifié sur ordinateur et sur mobile.
- Ancienne adresse `/voyage/cologne-12-dec/` vérifiée dans le navigateur : elle affiche le nouveau programme de Cologne.
- Contrôle des données : treize véhicules, six photographies historiques, un programme à venir et neuf archives distinctes.
- Les trente-deux URL d’images distinctes référencées dans ces données répondaient toutes en HTTP 200 lors du contrôle.
- Le nouveau formulaire conserve les coordonnées facultatives de facturation et de TVA dans les remarques transmises à l’administration. Aucun nouvel envoi réel de formulaire n’a été effectué pendant cette vérification.
- L’administration et ses règles d’accès ne sont pas modifiées par cette refonte publique ; aucune session responsable authentifiée n’a été testée pendant cette intervention.
