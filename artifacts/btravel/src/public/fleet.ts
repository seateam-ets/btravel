import content from '@/content/site-content.json';

// Les modèles et photos proviennent du site b-travel.be. Les fourchettes de places
// sont des ordres de grandeur par catégorie de véhicule (le site actuel indique
// « jusqu'à 83 places ») : la capacité exacte est confirmée dans chaque devis.
export type FleetCategory = {
  id: string;
  name: string;
  seats: string;
  maxSeats: number;
  usage: string;
  description: string;
  highlights: string[];
  models: { name: string; image: string }[];
};

const photo = (name: string) => content.fleet.find(model => model.name === name)?.image ?? content.heroImage;
const models = (...names: string[]) => names.map(name => ({ name, image: photo(name) }));

export const fleetCategories: FleetCategory[] = [
  {
    id: 'minibus', name: 'Minibus', seats: 'Jusqu’à 19 places', maxSeats: 19,
    usage: 'Petits groupes, transferts, équipes',
    description: 'Souple et discret, le minibus convient aux petits groupes, aux transferts vers l’aéroport ou aux déplacements d’équipe.',
    highlights: ['Accès aisé en ville', 'Idéal pour les petits groupes', 'Prise en charge à l’adresse'],
    models: models('Sprinter', 'Ford', 'Iveco'),
  },
  {
    id: 'midicar', name: 'Midicar', seats: 'De 20 à 35 places', maxSeats: 35,
    usage: 'Classes, clubs, associations',
    description: 'Le bon format pour une classe, un club sportif ou une association : le confort d’un autocar dans un gabarit compact.',
    highlights: ['Format adapté à une classe', 'Soutes à bagages', 'Maniable sur les petites routes'],
    models: models('Otokar Navigo', 'Wing', 'Mercedes Atego'),
  },
  {
    id: 'scolaire', name: 'Autocar scolaire', seats: 'Jusqu’à 60 places environ', maxSeats: 60,
    usage: 'Sorties scolaires, trajets réguliers',
    description: 'Robustes et pratiques, ces autocars assurent les sorties scolaires, les trajets réguliers et les navettes d’événement.',
    highlights: ['Pensé pour les écoles', 'Montée et descente rapides', 'Ceintures de sécurité'],
    models: models('Iveco Crossway', 'Mercedes Intouro'),
  },
  {
    id: 'tourisme', name: 'Grand tourisme', seats: 'Jusqu’à 57 places environ', maxSeats: 57,
    usage: 'Excursions, voyages à l’étranger',
    description: 'Pour les longues distances et les voyages à l’étranger : sièges confortables, grandes soutes et équipements de voyage.',
    highlights: ['Confort longue distance', 'Grandes soutes', 'Voyages en Europe'],
    models: models('Mercedes Travego', 'MAN Lion’s', 'Yutong GT 12'),
  },
  {
    id: 'double', name: 'Double étage', seats: 'Jusqu’à 83 places', maxSeats: 83,
    usage: 'Grands groupes, écoles entières',
    description: 'Nos plus grands autocars transportent une école ou un grand groupe en un seul véhicule, avec une vue panoramique à l’étage.',
    highlights: ['Jusqu’à 83 passagers', 'Un seul véhicule pour tout le groupe', 'Vue panoramique'],
    models: models('Néoplan Skyliner', 'Setra 531'),
  },
];

/** Plus petite catégorie capable d'accueillir le groupe (catégorie suivante sinon). */
export function categoryForPassengers(passengers: number): FleetCategory {
  const sized = [...fleetCategories].sort((a, b) => a.maxSeats - b.maxSeats);
  return sized.find(category => passengers <= category.maxSeats) ?? sized[sized.length - 1];
}

export const transportTypes = [
  { value: 'Sortie scolaire', hint: 'Musée, classe verte, excursion' },
  { value: 'Excursion de groupe', hint: 'Association, club, seniors' },
  { value: 'Transport d’entreprise', hint: 'Séminaire, team building' },
  { value: 'Navette événement', hint: 'Mariage, festival, salon' },
  { value: 'Voyage à l’étranger', hint: 'Plusieurs jours en Europe' },
  { value: 'Autre demande', hint: 'Décrivez votre besoin' },
];
