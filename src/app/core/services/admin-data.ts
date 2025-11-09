import { Injectable } from '@angular/core';
import { ProfilesService, AdminUserRecord } from './profiles';
import { Services } from './services';
import { BookingsService } from './bookings';
import { CategoriesService } from './categories';
import { WoyaService } from '../models/service.model';
import { ServiceBooking, BookingStatus } from '../models/booking.model';
import { Category } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  constructor(
    private profiles: ProfilesService,
    private servicesApi: Services,
    private bookings: BookingsService,
    private categories: CategoriesService,
  ) {}

  listUsers(): Promise<AdminUserRecord[]> {
    return this.profiles.listAllUsers();
  }

  deleteUser(uid: string) {
    return this.profiles.deleteUser(uid);
  }

  updateUser(uid: string, payload: Partial<AdminUserRecord>) {
    return this.profiles.updateUser(uid, payload);
  }

  listServices(): Promise<WoyaService[]> {
    return this.servicesApi.list();
  }

  removeService(serviceId: string) {
    return this.servicesApi.remove(serviceId);
  }

  updateServiceStatus(serviceId: string, active: boolean) {
    return this.servicesApi.update(serviceId, { isActive: active });
  }

  listBookings(): Promise<ServiceBooking[]> {
    return this.bookings.listAll();
  }

  updateBookingStatus(bookingId: string, status: BookingStatus) {
    return this.bookings.updateStatus(bookingId, status);
  }

  deleteBooking(bookingId: string) {
    return this.bookings.delete(bookingId);
  }

  listCategories(): Promise<Category[]> {
    return this.categories.listAll();
  }

  createCategory(payload: { name: string; description?: string; serviceTitles?: string[] }) {
    return this.categories.create(payload);
  }

  updateCategory(id: string, payload: Partial<Category>) {
    return this.categories.update(id, payload);
  }

  deleteCategory(id: string) {
    return this.categories.remove(id);
  }
}
