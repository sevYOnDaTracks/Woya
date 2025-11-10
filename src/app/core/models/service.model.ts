export type BillingMode = 'hourly' | 'per_service';

export interface WoyaService {
  id?: string;
  title: string;
  description: string;
  category: string;
  city: string;
  price?: number | null;
  billingMode?: BillingMode;
  contact: string;
  createdAt: number;
  updatedAt?: number;
  coverUrl?: string | null;
  extraImages?: (string | null)[];
  ownerId?: string;
  location?: { lat: number; lng: number } | null;
  coverageKm?: number | null;
  isActive?: boolean;
  availability?: ServiceAvailability | null;
}

export interface ServiceAvailability {
  durationMinutes: number;
  days: ServiceAvailabilityDay[];
}

export interface ServiceAvailabilityDay {
  day: number; // 0 = dimanche, 6 = samedi (JS getDay)
  start: string; // HH:mm
  end: string;   // HH:mm
}
