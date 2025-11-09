import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from '../core/store/admin-auth.service';
import { AdminDataService } from '../core/services/admin-data';
import { AdminUserRecord } from '../core/services/profiles';
import { WoyaService } from '../core/models/service.model';
import { BookingStatus, ServiceBooking } from '../core/models/booking.model';
import { Category } from '../core/models/category.model';

type AdminTab = 'users' | 'services' | 'categories' | 'bookings' | 'reservations';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export default class AdminDashboard implements OnInit {
  loading = true;
  error = '';
  activeTab: AdminTab = 'users';
  searchTerm = '';
  userSearch = '';
  serviceSearch = '';
  serviceOwnerSearch = '';
  serviceCategoryFilter = 'all';
  categories: Category[] = [];
  categorySearch = '';
  categoryForm: { name: string; description: string; isActive: boolean; serviceTitles: string[] } = this.createEmptyCategoryForm();
  editingCategoryId: string | null = null;
  categoryMessage = '';
  categoryMessageType: 'success' | 'error' | '' = '';
  newServiceTitle = '';

  users: AdminUserRecord[] = [];
  services: WoyaService[] = [];
  bookings: ServiceBooking[] = [];

  private userIndex = new Map<string, AdminUserRecord>();
  updatingServiceId: string | null = null;
  deletingServiceId: string | null = null;
  deletingUserId: string | null = null;
  updatingBookingId: string | null = null;
  deletingBookingId: string | null = null;
  selectedUserId: string | null = null;
  updatingUserId: string | null = null;
  userForm = this.createEmptyUserForm();
  savingUser = false;
  userUpdateMessage = '';
  userUpdateState: 'success' | 'error' | '' = '';
  readonly defaultAvatar = 'https://ui-avatars.com/api/?name=W&background=fff3e0&color=ff7a00';
  readonly defaultServiceImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=60';

  constructor(
    private adminAuth: AdminAuthService,
    private adminData: AdminDataService,
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.error = '';
    try {
      const [users, services, bookings, categories] = await Promise.all([
        this.adminData.listUsers(),
        this.adminData.listServices(),
        this.adminData.listBookings(),
        this.adminData.listCategories(),
      ]);
      this.users = users;
      this.services = services;
      this.bookings = bookings;
      this.categories = categories;
      this.buildUserIndex();
    } catch (error) {
      console.error('Admin data load failed', error);
      this.error = 'Impossible de récupérer les données administrateur.';
    } finally {
      this.loading = false;
    }
  }

  get filteredUsers() {
    return this.applySearch(this.users, this.userSearch, user => [
      user.firstname,
      user.lastname,
      user.pseudo,
      user.email,
      user.city,
      user.profession,
    ]).slice(0, 5);
  }

  get filteredServices() {
    const categoryTerm = this.serviceCategoryFilter.trim().toLowerCase();
    const ownerTerm = this.serviceOwnerSearch.trim().toLowerCase();
    return this.applySearch(
      this.services.filter(service => {
        const categoryMatch =
          categoryTerm === 'all' || categoryTerm === '' || (service.category || '').toLowerCase() === categoryTerm;
        const ownerMatch = !ownerTerm || this.displayUserName(service.ownerId).toLowerCase().includes(ownerTerm);
        return categoryMatch && ownerMatch;
      }),
      this.serviceSearch,
      service => [service.title, service.category, service.city, this.displayUserName(service.ownerId)],
    ).slice(0, 5);
  }

  get filteredBookings() {
    return this.applySearch(this.bookings, this.searchTerm, booking => [
      booking.serviceTitle,
      this.displayUserName(booking.providerId),
      this.displayUserName(booking.clientId),
      booking.status,
    ]);
  }

  get filteredCategories() {
    return this.applySearch(this.categories, this.categorySearch, category => [
      category.name,
      category.description,
    ]);
  }

  get upcomingReservations() {
    const now = Date.now();
    return this.filteredBookings.filter(b => (b.startTime ?? 0) >= now);
  }

  get pastReservations() {
    const now = Date.now();
    return this.filteredBookings.filter(b => (b.startTime ?? 0) < now);
  }

  get stats() {
    const confirmed = this.bookings.filter(b => b.status === 'confirmed').length;
    const pending = this.bookings.filter(b => b.status === 'pending').length;
    return {
      users: this.users.length,
      services: this.services.length,
      categories: this.categories.length,
      bookings: this.bookings.length,
      confirmed,
      pending,
    };
  }

  get serviceCategoryOptions() {
    const active = Array.from(new Set(this.categories.filter(cat => cat.isActive !== false).map(cat => cat.name))).filter(
      Boolean,
    ) as string[];
    if (active.length) {
      return active;
    }
    return Array.from(new Set(this.services.map(service => service.category).filter(Boolean))) as string[];
  }

  switchTab(tab: AdminTab) {
    this.activeTab = tab;
  }

  setServiceCategoryFilter(value: string) {
    this.serviceCategoryFilter = value;
  }

  async toggleService(service: WoyaService) {
    if (!service?.id) return;
    this.updatingServiceId = service.id;
    try {
      const nextState = service.isActive === false ? true : false;
      await this.adminData.updateServiceStatus(service.id, nextState);
      service.isActive = nextState;
    } finally {
      this.updatingServiceId = null;
    }
  }

  async deleteService(service: WoyaService) {
    if (!service?.id) return;
    if (!window.confirm(`Supprimer définitivement le service "${service.title}" ?`)) return;
    this.deletingServiceId = service.id;
    try {
      await this.adminData.removeService(service.id);
      this.services = this.services.filter(s => s.id !== service.id);
    } finally {
      this.deletingServiceId = null;
    }
  }

  async deleteUser(user: AdminUserRecord) {
    if (!user?.id) return;
    if (!window.confirm(`Supprimer le compte ${this.displayUserName(user.id)} ?`)) return;
    this.deletingUserId = user.id;
    try {
      await this.adminData.deleteUser(user.id);
      this.users = this.users.filter(u => u.id !== user.id);
      this.buildUserIndex();
      if (this.selectedUserId === user.id) {
        this.cancelEditUser();
      }
    } finally {
      this.deletingUserId = null;
    }
  }

  async toggleUserStatus(user: AdminUserRecord) {
    if (!user?.id) return;
    this.updatingUserId = user.id;
    const nextState = user.isActive === false;
    try {
      await this.adminData.updateUser(user.id, { isActive: nextState });
      user.isActive = nextState;
    } finally {
      this.updatingUserId = null;
    }
  }

  async updateBookingStatus(booking: ServiceBooking, status: BookingStatus) {
    if (!booking?.id) return;
    this.updatingBookingId = booking.id;
    try {
      await this.adminData.updateBookingStatus(booking.id, status);
      booking.status = status;
    } finally {
      this.updatingBookingId = null;
    }
  }

  async deleteBooking(booking: ServiceBooking) {
    if (!booking?.id) return;
    if (!window.confirm('Supprimer cette réservation ?')) return;
    this.deletingBookingId = booking.id;
    try {
      await this.adminData.deleteBooking(booking.id);
      this.bookings = this.bookings.filter(b => b.id !== booking.id);
    } finally {
      this.deletingBookingId = null;
    }
  }

  startCategoryEdit(category: Category) {
    this.editingCategoryId = category.id;
    this.categoryForm = {
      name: category.name,
      description: category.description || '',
      isActive: category.isActive !== false,
      serviceTitles: [...(category.serviceTitles ?? [])],
    };
    this.categoryMessage = '';
    this.categoryMessageType = '';
  }

  cancelCategoryEdit() {
    this.editingCategoryId = null;
    this.categoryForm = this.createEmptyCategoryForm();
    this.categoryMessage = '';
    this.categoryMessageType = '';
    this.newServiceTitle = '';
  }

  async saveCategory() {
    if (!this.categoryForm.name.trim()) {
      this.categoryMessage = 'Le nom de la catégorie est obligatoire.';
      this.categoryMessageType = 'error';
      return;
    }
    try {
      if (this.editingCategoryId) {
        await this.adminData.updateCategory(this.editingCategoryId, {
          name: this.categoryForm.name.trim(),
          description: this.categoryForm.description.trim(),
          isActive: this.categoryForm.isActive,
          serviceTitles: this.categoryForm.serviceTitles,
        });
      } else {
        await this.adminData.createCategory({
          name: this.categoryForm.name.trim(),
          description: this.categoryForm.description.trim(),
          serviceTitles: this.categoryForm.serviceTitles,
        });
      }
      this.categories = await this.adminData.listCategories();
      this.cancelCategoryEdit();
      this.categoryMessage = 'Catégorie enregistrée.';
      this.categoryMessageType = 'success';
    } catch (error) {
      console.error('Unable to save category', error);
      this.categoryMessage = 'Impossible d’enregistrer cette catégorie.';
      this.categoryMessageType = 'error';
    }
  }

  async deleteCategory(category: Category) {
    if (!category?.id) return;
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await this.adminData.deleteCategory(category.id);
      this.categories = this.categories.filter(cat => cat.id !== category.id);
    } catch (error) {
      console.error('Unable to delete category', error);
      this.categoryMessage = 'Suppression impossible pour le moment.';
      this.categoryMessageType = 'error';
    }
  }

  async toggleCategoryStatus(category: Category) {
    if (!category?.id) return;
    try {
      await this.adminData.updateCategory(category.id, { isActive: category.isActive === false });
      category.isActive = category.isActive === false;
    } catch (error) {
      console.error('Unable to toggle category', error);
      this.categoryMessage = 'Impossible de mettre à jour le statut.';
      this.categoryMessageType = 'error';
    }
  }

  addServiceTitle() {
    const value = this.newServiceTitle.trim();
    if (!value) return;
    if (!this.categoryForm.serviceTitles.includes(value)) {
      this.categoryForm.serviceTitles.push(value);
    }
    this.newServiceTitle = '';
  }

  removeServiceTitle(title: string) {
    this.categoryForm.serviceTitles = this.categoryForm.serviceTitles.filter(item => item !== title);
  }

  logout() {
    this.adminAuth.logout();
    window.location.href = '/admin';
  }

  startEditUser(user: AdminUserRecord) {
    this.selectedUserId = user.id;
    this.userUpdateMessage = '';
    this.userUpdateState = '';
    this.userForm = {
      firstname: user.firstname ?? '',
      lastname: user.lastname ?? '',
      pseudo: user.pseudo ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      city: user.city ?? '',
      profession: user.profession ?? '',
      role: user.role ?? '',
      isActive: user.isActive !== false,
    };
  }

  cancelEditUser() {
    this.selectedUserId = null;
    this.userForm = this.createEmptyUserForm();
    this.savingUser = false;
    this.userUpdateMessage = '';
    this.userUpdateState = '';
  }

  async saveUser() {
    if (!this.selectedUserId) return;
    const payload = this.buildUserUpdatePayload();
    this.savingUser = true;
    this.userUpdateMessage = '';
    this.userUpdateState = '';
    try {
      await this.adminData.updateUser(this.selectedUserId, payload);
      const target = this.users.find(user => user.id === this.selectedUserId);
      if (target) {
        Object.assign(target, payload);
      }
      this.buildUserIndex();
      this.userUpdateMessage = 'Profil mis à jour avec succès.';
      this.userUpdateState = 'success';
    } catch (error) {
      console.error('Unable to update user', error);
      this.userUpdateMessage = 'Impossible de sauvegarder les modifications.';
      this.userUpdateState = 'error';
    } finally {
      this.savingUser = false;
    }
  }

  private buildUserIndex() {
    this.userIndex.clear();
    this.users.forEach(user => this.userIndex.set(user.id, user));
  }

  displayUserName(uid?: string | null) {
    if (!uid) return '—';
    const profile = this.userIndex.get(uid);
    if (!profile) return uid;
    const fullName = [profile.firstname, profile.lastname].filter(Boolean).join(' ').trim();
    return fullName || profile.pseudo || profile.email || uid;
  }

  private applySearch<T>(
    collection: T[],
    termOrExtractor: string | ((value: T) => (string | undefined | null)[]),
    extractorOrUndefined?: (value: T) => (string | undefined | null)[],
  ) {
    const term = typeof termOrExtractor === 'string' ? termOrExtractor : this.searchTerm;
    const extractor = typeof termOrExtractor === 'string' ? extractorOrUndefined : termOrExtractor;
    if (!extractor) return collection;
    const normalized = term.trim().toLowerCase();
    if (!normalized) return collection;
    return collection.filter(item =>
      extractor(item)
        .filter(Boolean)
        .some(field => (field ?? '').toString().toLowerCase().includes(normalized)),
    );
  }

  private createEmptyUserForm() {
    return {
      firstname: '',
      lastname: '',
      pseudo: '',
      email: '',
      phone: '',
      city: '',
      profession: '',
      role: '',
      isActive: true,
    };
  }

  private buildUserUpdatePayload(): Partial<AdminUserRecord> {
    const payload: Partial<AdminUserRecord> = {};
    Object.entries(this.userForm).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const trimmed = typeof value === 'string' ? value.trim() : value;
        payload[key as keyof AdminUserRecord] = trimmed as any;
      }
    });
    return payload;
  }

  private createEmptyCategoryForm() {
    return {
      name: '',
      description: '',
      isActive: true,
      serviceTitles: [] as string[],
    };
  }
}
