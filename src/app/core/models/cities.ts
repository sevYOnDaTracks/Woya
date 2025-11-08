export interface CityOption {
  name: string;
  lat: number;
  lng: number;
  region?: string;
  aliases?: string[];
}

export const CITY_OPTIONS: CityOption[] = [
  {
    name: 'Abidjan',
    lat: 5.345317,
    lng: -4.024429,
    region: 'District d’Abidjan',
    aliases: ['Plateau'],
  },
  {
    name: 'Abobo',
    lat: 5.4161,
    lng: -4.0163,
    region: 'Nord Abidjan',
  },
  {
    name: 'Anyama',
    lat: 5.4928,
    lng: -4.0518,
    region: 'Nord Abidjan',
  },
  {
    name: 'Bingerville',
    lat: 5.356,
    lng: -3.8943,
    region: 'Est Abidjan',
  },
  {
    name: 'Cocody',
    lat: 5.3476,
    lng: -3.9869,
    region: 'Est Abidjan',
  },
  {
    name: 'Koumassi',
    lat: 5.2927,
    lng: -3.9488,
    region: 'Sud Abidjan',
  },
  {
    name: 'Marcory',
    lat: 5.3091,
    lng: -3.981,
    region: 'Sud Abidjan',
    aliases: ['Zone 4'],
  },
  {
    name: 'Port-Bouët',
    lat: 5.2558,
    lng: -3.9646,
    region: 'Sud Abidjan',
  },
  {
    name: 'Treichville',
    lat: 5.3097,
    lng: -4.0127,
    region: 'Centre Abidjan',
  },
  {
    name: 'Yopougon',
    lat: 5.3731,
    lng: -4.0509,
    region: 'Ouest Abidjan',
  },
  {
    name: 'Grand-Bassam',
    lat: 5.2118,
    lng: -3.7388,
    region: 'Grand-Bassam',
  },
];
