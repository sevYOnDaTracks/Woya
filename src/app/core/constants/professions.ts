export const PROFESSION_OPTIONS = [
  'Plombier',
  'Electricien',
  'Menuisier',
  'Macon',
  'Peintre',
  'Jardinier',
  'Mecanicien',
  'Chauffeur',
  'Livreur',
  'Cuisinier',
  'Coiffeur',
  'Coiffeuse',
  'Estheticien',
  'Developpeur web',
  'Designer graphique',
  'Community manager',
  'Photographe',
  'Videaste',
  'Coach sportif',
  'Infirmier',
  'Cadre en entreprise',
  'Enseignant',
  'Comptable',
  'Agent immobilier',
  'Agent de securite',
  'Menage / Nettoyage',
  'Etudiant',
];

export const OTHER_PROFESSION_OPTION = 'Autres';

export function matchProfessionOption(value?: string | null) {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  return PROFESSION_OPTIONS.find(option => option.toLowerCase() === normalized) || '';
}

export function resolveProfessionValue(selected: string, custom: string) {
  const selectedValue = (selected || '').trim();
  if (selectedValue && selectedValue !== OTHER_PROFESSION_OPTION) {
    return selectedValue;
  }
  const customValue = (custom || '').trim();
  if (selectedValue === OTHER_PROFESSION_OPTION && customValue) {
    return customValue;
  }
  return '';
}
