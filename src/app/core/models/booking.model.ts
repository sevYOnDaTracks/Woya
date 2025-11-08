export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface ServiceBooking {
  id?: string;
  serviceId: string;
  serviceTitle: string;
  providerId: string;
  clientId: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: BookingStatus;
  createdAt: number;
}

export interface CreateBookingInput {
  serviceId: string;
  serviceTitle: string;
  providerId: string;
  clientId: string;
  startTime: number;
  durationMinutes: number;
}
