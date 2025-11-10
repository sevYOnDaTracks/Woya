import { WoyaService } from '../models/service.model';

const priceFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatServicePrice(service: WoyaService | null | undefined): string {
  if (!service || typeof service.price !== 'number' || Number.isNaN(service.price)) {
    return 'Tarif à définir';
  }
  const base = `${priceFormatter.format(service.price)} FCFA`;
  return service.billingMode === 'hourly' ? `${base} / heure` : base;
}
