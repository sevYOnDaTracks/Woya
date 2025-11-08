import { OnInit, AfterViewInit } from '@angular/core';
import { Component } from '@angular/core';
import { SharedImports } from '../../shared/shared-imports';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';
import { Router } from '@angular/router';
import { ProfilesService } from '../../core/services/profiles';
import { MessagingService } from '../../core/services/messaging';
import { AuthStore } from '../../core/store/auth.store';
import { firebaseServices } from '../../app.config';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';

@Component({
  selector: 'app-list-services',
  standalone: true,
  imports: [...SharedImports, TimeAgoPipe],
  templateUrl: './list-services.html',
})
export default class ListServices implements OnInit, AfterViewInit {

  loading = true;
  loadingMore = false;

  services: WoyaService[] = [];
  filteredAll: WoyaService[] = [];
  filtered: WoyaService[] = [];

  visibleCount = 4;

  q: string = '';
  category: string = 'Toutes';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  priceBoundsReady = false;
  pendingCount = 0;
  userLocation: { lat: number; lng: number } | null = null;
  locating = false;
  locationError = '';
  limitToCoverage = false;

  categories = [
    'Toutes',
    'Jardinage',
    'Ménage & Aide à domicile',
    'Cours particuliers',
    'Transport & Déménagement',
    'Informatique',
    'Bricolage / Réparation',
    'Beauté & Bien-être',
    'Garde d’enfants',
  ];

  ownerProfiles = new Map<string, any>();

  constructor(
    private api: Services,
    private router: Router,
    private profiles: ProfilesService,
    private messaging: MessagingService,
    private auth: AuthStore,
  ) {}

  async ngOnInit() {
    this.services = await this.api.list();
    this.services = this.services.map(s => {
      if ((s.createdAt as any)?.seconds) {
        s.createdAt = (s.createdAt as any).seconds * 1000;
      }
      return s;
    });

    await this.hydrateOwners(this.services);
    this.setupBudgetBounds();
    this.applyCurrentFilters();
    this.loading = false;
  }

  ngAfterViewInit() {
    window.addEventListener('scroll', () => {
      if (this.loadingMore || this.loading) return;

      const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (bottom) this.loadMore();
    });
  }

  applyCurrentFilters() {
    const results = this.computeFilteredServices();
    const initialChunk = results.length === 0 ? 0 : Math.min(4, results.length);
    this.visibleCount = initialChunk;
    this.filteredAll = results;
    this.filtered = results.slice(0, this.visibleCount);
    this.pendingCount = results.length;
  }

  previewFilters() {
    this.pendingCount = this.computeFilteredServices().length;
  }

  async loadMore() {
    if (this.visibleCount >= this.filteredAll.length) return;

    this.loadingMore = true;

    setTimeout(() => {
      this.visibleCount += 5;
      this.filtered = this.filteredAll.slice(0, this.visibleCount);
      this.loadingMore = false;
    }, 800);
  }

  private async hydrateOwners(services: WoyaService[]) {
    const ids = Array.from(
      new Set(
        services
          .map(s => s.ownerId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    await Promise.all(
      ids.map(async id => {
        if (this.ownerProfiles.has(id)) return;
        const profile = await this.profiles.getPublicProfile(id);
        this.ownerProfiles.set(id, profile);
      }),
    );
  }

  phoneToWhatsApp(phone: string) {
    return 'https://wa.me/' + phone.replace(/[^0-9]/g, '');
  }

  goToDetails(id: string) {
    this.router.navigate(['/services', id]);
  }

  viewOwnerProfile(event: Event, service: WoyaService) {
    event.stopPropagation();
    if (!service.ownerId) {
      return;
    }
    this.router.navigate(['/prestataires', service.ownerId]);
  }

  getOwnerName(service: WoyaService) {
    const profile = service.ownerId ? this.ownerProfiles.get(service.ownerId) : null;
    if (!profile) return 'Prestataire';
    if (profile.pseudo) return profile.pseudo;
    return [profile.firstname, profile.lastname].filter(Boolean).join(' ').trim() || 'Prestataire';
  }

  async contactOwner(event: Event, service: WoyaService) {
    event.stopPropagation();
    const ownerId = service.ownerId;
    if (!ownerId) return;
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    if (current.uid === ownerId) {
      this.router.navigate(['/messagerie']);
      return;
    }
    const conversationId = await this.messaging.ensureConversation(ownerId);
    if (conversationId) {
      this.router.navigate(['/messagerie', conversationId]);
    }
  }

  onFilterInputChange() {
    this.previewFilters();
  }

  onCoverageToggle() {
    if (!this.userLocation) {
      this.limitToCoverage = false;
    }
    this.previewFilters();
  }

  onBudgetChange() {
    if (this.minPrice !== null && this.minPrice < 0) this.minPrice = 0;
    if (this.maxPrice !== null && this.maxPrice < 0) this.maxPrice = 0;
    if (this.minPrice !== null && this.maxPrice !== null && this.minPrice > this.maxPrice) {
      this.maxPrice = this.minPrice;
    }
    this.previewFilters();
  }

  private withinBudget(service: WoyaService): boolean {
    const price = typeof service.price === 'number' ? service.price : null;
    if (this.minPrice !== null && (price === null || price < this.minPrice)) {
      return false;
    }
    if (this.maxPrice !== null && (price === null || price > this.maxPrice)) {
      return false;
    }
    return true;
  }

  detectLocation() {
    if (!navigator.geolocation) {
      this.locationError = 'La géolocalisation n’est pas disponible.';
      return;
    }
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      position => {
        this.locating = false;
        this.locationError = '';
        this.userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        this.previewFilters();
      },
      () => {
        this.locating = false;
        this.locationError = 'Impossible de récupérer ta position.';
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  clearLocation() {
    this.userLocation = null;
    this.limitToCoverage = false;
    this.previewFilters();
  }

  private matchesCoverage(service: WoyaService): boolean {
    if (!this.limitToCoverage || !this.userLocation) {
      return true;
    }
    if (!service.location || !service.coverageKm) {
      return false;
    }
    const distance = this.computeDistanceKm(this.userLocation, service.location);
    return distance <= service.coverageKm;
  }

  private setupBudgetBounds() {
    this.priceBoundsReady = this.services.some(s => typeof s.price === 'number');
    if (!this.priceBoundsReady) {
      this.minPrice = null;
      this.maxPrice = null;
    }
    this.previewFilters();
  }

  private computeFilteredServices(): WoyaService[] {
    const q = this.q.toLowerCase();

    return this.services.filter(s => {
      const matchesText = [s.title, s.description, s.city, s.category]
        .join(' ')
        .toLowerCase()
        .includes(q);

      const matchesCategory = this.category === 'Toutes' || s.category === this.category;
      const matchesBudget = this.withinBudget(s);
      const matchesCoverage = this.matchesCoverage(s);

      return matchesText && matchesCategory && matchesBudget && matchesCoverage;
    });
  }

  imageIndex: { [id: string]: number } = {};
  translateX: { [id: string]: number } = {};
  dragging: { [id: string]: boolean } = {};
  touchStartX = 0;
  touchMoveX = 0;

  getCurrentImage(s: WoyaService) {
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    if (images.length === 0) return 'assets/icone.png';
    if (!(s.id! in this.imageIndex)) this.imageIndex[s.id!] = 0;
    return images[this.imageIndex[s.id!]];
  }

  nextImage(s: WoyaService, event?: Event) {
    event?.stopPropagation();
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    this.imageIndex[s.id!] = (this.imageIndex[s.id!] + 1) % images.length;
  }

  prevImage(s: WoyaService, event?: Event) {
    event?.stopPropagation();
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    this.imageIndex[s.id!] = (this.imageIndex[s.id!] - 1 + images.length) % images.length;
  }

  onTouchStart(s: WoyaService, event: TouchEvent) {
    this.dragging[s.id!] = true;
    this.touchStartX = event.touches[0].clientX;
  }

  onTouchMove(s: WoyaService, event: TouchEvent) {
    if (!this.dragging[s.id!]) return;
    this.touchMoveX = event.touches[0].clientX;
    this.translateX[s.id!] = this.touchMoveX - this.touchStartX;
  }

  onTouchEnd(s: WoyaService) {
    this.dragging[s.id!] = false;
    if (this.translateX[s.id!] > 60) this.prevImage(s);
    else if (this.translateX[s.id!] < -60) this.nextImage(s);
    this.translateX[s.id!] = 0;
  }

  getImages(s: WoyaService) {
    return [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
  }

  private computeDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const hav =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
    return R * c;
  }
}
