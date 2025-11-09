import { Component, OnDestroy, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

// ✅ Firebase
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Services } from '../../core/services/services';
import { AuthStore } from '../../core/store/auth.store';
import { firebaseServices } from '../../app.config';
import { ServiceAvailability, WoyaService } from '../../core/models/service.model';
import { CITY_OPTIONS, CityOption } from '../../core/models/cities';
import { HttpClient, HttpClientModule } from '@angular/common/http';

type AvailabilityFormDay = { day: number; start: string; end: string; enabled: boolean };

@Component({
  selector: 'app-new-service',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './new-service.html'
})
export default class NewService implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  private readonly defaultCoverIcon = 'assets/icone.png';
  private readonly serviceSuggestions: Record<string, string[]> = {
    'Jardinage': [
      'Entretien jardin',
      'Tonte de pelouse',
      'Taille de haies',
      'Élagage d\'arbres',
      'Création potager urbain',
      'Arrosage automatique',
      'Plantation de fleurs'
    ],
    'Ménage & Aide à domicile': [
      'Ménage complet',
      'Nettoyage ponctuel',
      'Repassage à domicile',
      'Aide senior',
      'Cuisine à domicile',
      'Organisation dressing'
    ],
    'Cours particuliers': [
      'Cours de maths lycée',
      'Cours d\'anglais',
      'Soutien scolaire primaire',
      'Préparation BAC',
      'Initiation informatique',
      'Coaching examen'
    ],
    'Transport & Déménagement': [
      'Déménagement complet',
      'Aide au déménagement',
      'Livraison express',
      'Chauffeur privé',
      'Navette aéroport',
      'Course moto'
    ],
    'Informatique': [
      'Dépannage ordinateur',
      'Installation wifi',
      'Maintenance réseau',
      'Récupération de données',
      'Création site vitrine',
      'Formation bureautique'
    ],
    'Bricolage / Réparation': [
      'Plomberie urgente',
      'Électricité domestique',
      'Montage de meubles',
      'Peinture intérieure',
      'Réparation climatisation',
      'Menuiserie légère'
    ],
    'Beauté & Bien-être': [
      'Coiffeur à domicile',
      'Coiffure tresses',
      'Barber mobile',
      'Massage relaxant',
      'Massage thérapeutique',
      'Maquillage événementiel',
      'Pose d\'ongles',
      'Soins du visage'
    ],
    'Garde d\'enfants': [
      'Baby-sitting soirée',
      'Garde périscolaire',
      'Accompagnement sortie d\'école',
      'Animations anniversaire',
      'Aide aux devoirs primaire',
      'Garde week-end'
    ],
    'Coaching et Formation': [
      'Coaching personnel',
      'Formation bureautique',
      'Préparation concours',
      'Atelier leadership',
      'Orientation scolaire',
      'Accompagnement entrepreneuriat'
    ],
    'Santé & Bien-être': [
      'Massage thérapeutique',
      'Coach sportif à domicile',
      'Programme nutritionnel',
      'Soins du visage premium',
      'Séance de stretching',
      'Yoga à domicile'
    ],
    'Événementiel': [
      'Organisation anniversaire',
      'Décoration mariage',
      'DJ événementiel',
      'Animateur pour enfants',
      'Location matériel son',
      'Photographe événementiel'
    ],
    'Services administratifs': [
      'Saisie de documents',
      'Gestion de dossiers',
      'Assistance administrative',
      'Rédaction de courrier',
      'Classement d\'archives'
    ],
    'default': [
      'Service à la personne',
      'Assistance administrative',
      'Coaching personnel',
      'Maintenance générale'
    ],
  };
  loading = false;
  editing = false;
  serviceId: string | null = null;
  existingCoverUrl: string | null = null;
  existingExtraImages: string[] = [];
  existingImages: string[] = [];
  imageError = '';

  // ✅ MULTI IMAGE
  files: File[] = [];
  previews: string[] = [];
  currentLocation: { lat: number; lng: number } | null = { lat: 5.345317, lng: -4.024429 };
  coverageKm = 5;
  locating = false;
  locationError = '';
  private map?: L.Map;
  private marker?: L.Marker;
  private coverageCircle?: L.Circle;
  cityCatalog: CityOption[] = CITY_OPTIONS;
  citySuggestions: CityOption[] = [];
  cityDropdownOpen = false;
  cityError = '';
  private cityDropdownCloseTimeout?: any;
  titleSearch = '';
  filteredTitleSuggestions: string[] = [];
  titleDropdownOpen = false;
  titleTouched = false;
  private titleDropdownCloseTimeout?: any;

  categoryCatalog = [
    'Jardinage',
    'Ménage & Aide à domicile',
    'Cours particuliers',
    'Transport & Déménagement',
    'Informatique',
    'Bricolage / Réparation',
    'Beauté & Bien-être',
    'Garde d\'enfants',
    'Coaching et Formation',
    'Santé & Bien-être',
    'Événementiel',
    'Services administratifs',
  ];
  filteredCategories = this.categoryCatalog.slice(0, 6);
  categoryDropdownOpen = false;
  categoryTouched = false;
  private categoryDropdownCloseTimeout?: any;
  readonly weekDays = [
    { value: 1, label: 'Lundi' },
    { value: 2, label: 'Mardi' },
    { value: 3, label: 'Mercredi' },
    { value: 4, label: 'Jeudi' },
    { value: 5, label: 'Vendredi' },
    { value: 6, label: 'Samedi' },
    { value: 0, label: 'Dimanche' },
  ];

  form = {
    title: '',
    description: '',
    category: '',
    city: '',
    price: null as number | null,
    contact: '',
    isActive: true,
  };
  categoryInput = '';
  availability = {
    durationMinutes: 30,
    days: [] as AvailabilityFormDay[],
  };

  constructor(
    private api: Services,
    private router: Router,
    private auth: AuthStore,
    private route: ActivatedRoute,
    private location: Location,
    private http: HttpClient
  ) {
    this.initAvailability();
  }

  private initAvailability() {
    if (this.availability.days.length) return;
    this.availability.days = this.weekDays.map(day => ({
      day: day.value,
      start: '09:00',
      end: '18:00',
      enabled: false,
    }));
  }

  async ngOnInit() {
    const currentUser = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    const serviceId = this.route.snapshot.paramMap.get('id');
    if (serviceId) {
      this.editing = true;
      this.serviceId = serviceId;
      await this.loadExistingService(serviceId, currentUser.uid);
    } else {
      this.syncTitleControls();
    }
  }

  ngAfterViewInit() {
    this.initMap();
    this.useDeviceLocation();
  }

  ngOnDestroy() {
    this.map?.remove();
    if (this.titleDropdownCloseTimeout) {
      clearTimeout(this.titleDropdownCloseTimeout);
    }
    if (this.categoryDropdownCloseTimeout) {
      clearTimeout(this.categoryDropdownCloseTimeout);
    }
  }

  goBack() {
    const canGoBack = typeof window !== 'undefined' ? window.history.length > 1 : false;
    if (canGoBack) {
      this.location.back();
    } else {
      this.router.navigate(['/services']);
    }
  }

  async save() {
    const currentUser = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    if (!this.form.title || !this.getCurrentSuggestions().includes(this.form.title)) {
      this.titleTouched = true;
      this.openTitleDropdown();
      return;
    }
    if (!this.validateCategory()) {
      this.categoryTouched = true;
      this.openCategoryDropdown();
      return;
    }
    if (!this.validateCategory()) {
      this.categoryTouched = true;
      this.openCategoryDropdown();
      return;
    }
    const matchedCity = this.findCityOption(this.form.city);
    if (!matchedCity) {
      this.cityError = 'Sélectionne une ville proposée.';
      return;
    }
    this.form.city = matchedCity.name;
    this.loading = true;

    let imageUrls: string[] = [];
    const storage = getStorage();

    if (this.files.length > 0) {
      for (let file of this.files) {
        const path = `services/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        imageUrls.push(url);
      }
    }

    let coverUrl = this.existingCoverUrl;
    let extraImages = [...this.existingExtraImages];

    if (imageUrls.length > 0) {
      coverUrl = imageUrls[0] || null;
      extraImages = imageUrls.slice(1);
    }

    const normalizedCover = coverUrl ?? this.defaultCoverIcon;
    const normalizedExtra = extraImages.filter((img): img is string => !!img);
    const contactPhone = this.resolveContactPhone(currentUser);
    const sanitizedDescription = (this.form.description || '').slice(0, 250);

    const data = {
      ...this.form,
      description: sanitizedDescription,
      contact: contactPhone,
      coverUrl: normalizedCover,
      extraImages: normalizedExtra,
      ownerId: currentUser.uid,
      location: this.currentLocation,
      coverageKm: this.coverageKm,
      isActive: this.form.isActive !== false,
      availability: this.buildAvailabilityPayload(),
    };

    try {
      if (this.editing && this.serviceId) {
        await this.api.update(this.serviceId, {
          ...data,
          updatedAt: Date.now(),
        });
        this.router.navigate(['/mes-services']);
      } else {
        await this.api.create(data);
        this.router.navigate(['/services']);
      }
    } finally {
      this.loading = false;
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length || !this.ensureOnlyImages(files)) {
      return;
    }
    this.handleFiles(files);
  }

  onSelectImages(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) {
      return;
    }
    if (!this.ensureOnlyImages(files)) {
      input.value = '';
      return;
    }
    this.handleFiles(files);
    input.value = '';
  }

  handleFiles(files: File[]) {
    if (!files.length) return;
    this.files.push(...files);
    this.previews = [];

    for (let file of this.files) {
      const reader = new FileReader();
      reader.onload = () => this.previews.push(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  removeImage(index: number) {
    this.files.splice(index, 1);
    this.previews.splice(index, 1);
}

  useDeviceLocation() {
    if (!navigator.geolocation) {
      this.locationError = 'La géolocalisation n\'est pas disponible sur ce navigateur.';
      return;
    }
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      position => {
        this.locating = false;
        this.locationError = '';
        this.setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        this.locating = false;
        this.locationError = 'Impossible de récupérer ta position.';
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  private ensureOnlyImages(files: File[]) {
    const invalid = files.filter(file => !this.isImageFile(file));
    if (invalid.length) {
      this.imageError = 'Formats acceptés : uniquement des images (PNG, JPG, WebP, etc.).';
      return false;
    }
    this.imageError = '';
    return true;
  }

  private isImageFile(file: File) {
    const mime = (file.type || '').toLowerCase();
    if (mime) {
      return mime.startsWith('image/');
    }
    const extension = file.name ? file.name.toLowerCase() : '';
    return /\.(png|jpe?g|gif|bmp|webp|avif|heic|heif)$/.test(extension);
  }

  updateCoverage() {
    if (!this.map || !this.currentLocation) return;
    if (this.coverageCircle) {
      this.coverageCircle.setLatLng([this.currentLocation.lat, this.currentLocation.lng]);
      this.coverageCircle.setRadius(this.coverageKm * 1000);
    } else {
      this.coverageCircle = L.circle([this.currentLocation.lat, this.currentLocation.lng], {
        radius: this.coverageKm * 1000,
        color: '#FF7A00',
        fillColor: '#FF7A00',
        fillOpacity: 0.15,
        weight: 1.5,
      }).addTo(this.map);
    }
  }

  private async loadExistingService(serviceId: string, userId: string) {
    const snap = await this.api.getById(serviceId);
    if (!snap.exists()) {
      this.router.navigate(['/services']);
      return;
    }
    const service = snap.data() as WoyaService;

    if (service.ownerId !== userId) {
      this.router.navigate(['/services']);
      return;
    }

    this.form = {
      title: service.title,
      description: service.description,
      category: service.category,
      city: service.city,
      price: service.price ?? null,
      contact: service.contact,
      isActive: service.isActive !== false,
    };

    this.existingCoverUrl = service.coverUrl || null;
    this.existingExtraImages = (service.extraImages || []).filter((img): img is string => !!img);
    this.existingImages = [
      this.existingCoverUrl,
      ...this.existingExtraImages
    ].filter((img): img is string => !!img);

    this.coverageKm = service.coverageKm ?? this.coverageKm;
    const rawLocation: any = (service as any).location;
    if (rawLocation) {
      if (rawLocation.latitude !== undefined) {
        this.setLocation({ lat: rawLocation.latitude, lng: rawLocation.longitude });
      } else if (typeof rawLocation.lat === 'number' && typeof rawLocation.lng === 'number') {
        this.setLocation(rawLocation);
      }
    }

    if (service.city) {
      this.form.city = service.city;
    }
    if (service.category && !this.categoryCatalog.includes(service.category)) {
      this.categoryCatalog = [...this.categoryCatalog, service.category];
    }
    this.categoryInput = service.category;
    this.filteredCategories = this.categoryCatalog.slice(0, 6);
    this.patchAvailability(service.availability ?? null);
    this.ensureTitleInSuggestions(service.title, service.category);
    this.syncTitleControls();
  }

  private initMap() {
    if (!this.mapContainer) return;
    const start = this.currentLocation ?? { lat: 5.345317, lng: -4.024429 };
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [start.lat, start.lng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(this.map);
    this.marker.on('dragend', () => {
      const pos = this.marker?.getLatLng();
      if (pos) {
        this.setLocation({ lat: pos.lat, lng: pos.lng }, false);
      }
    });

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.setLocation({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    this.coverageCircle = L.circle([start.lat, start.lng], {
      radius: this.coverageKm * 1000,
      color: '#FF7A00',
      fillColor: '#FF7A00',
      fillOpacity: 0.15,
      weight: 1.5,
    }).addTo(this.map);
  }

  private setLocation(coords: { lat: number; lng: number }, panMap = true) {
    this.currentLocation = coords;
    if (this.marker) {
      this.marker.setLatLng([coords.lat, coords.lng]);
    }
    if (this.map && panMap) {
      this.map.setView([coords.lat, coords.lng], this.map.getZoom(), { animate: true });
    }
    this.updateCoverage();
  }

  private reverseGeocode(lat: number, lng: number) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1',
    });
    this.http
      .get<any>(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
        headers: { 'Accept-Language': 'fr' },
      })
      .subscribe({
        next: result => {
          const city =
            this.extractCity(result) ||
            result?.display_name?.split(',')[0]?.trim() ||
            '';
          this.form.city = city;
          this.applyCityMatch(city);
        },
      });
  }

  fillCityFromLocation() {
    if (!this.currentLocation) {
      this.locationError = 'Aucune position disponible. Clique sur \"Utiliser ma position\" d\'abord.';
      return;
    }
    this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
  }

  onCityInput(value: string) {
    this.form.city = value;
    if (!value) {
      this.citySuggestions = this.cityCatalog.slice(0, 6);
      this.cityError = '';
      this.cityDropdownOpen = false;
      return;
    }
    const normalized = value.trim().toLowerCase();
    this.citySuggestions = this.cityCatalog
      .filter(option =>
        option.name.toLowerCase().includes(normalized) ||
        (option.aliases ?? []).some(alias => alias.toLowerCase().includes(normalized)),
      )
      .slice(0, 6);

    const match = this.findCityOption(value);
    this.cityError = match ? '' : 'Sélectionne une ville proposée.';
    this.cityDropdownOpen = this.citySuggestions.length > 0;
  }

  openCityDropdown() {
    if (this.cityDropdownCloseTimeout) {
      clearTimeout(this.cityDropdownCloseTimeout);
    }
    if (!this.form.city) {
      this.citySuggestions = this.cityCatalog.slice(0, 6);
    }
    this.cityDropdownOpen = this.citySuggestions.length > 0;
  }

  closeCityDropdownSoon() {
    if (this.cityDropdownCloseTimeout) {
      clearTimeout(this.cityDropdownCloseTimeout);
    }
    this.cityDropdownCloseTimeout = setTimeout(() => {
      this.cityDropdownOpen = false;
    }, 150);
  }

  selectCitySuggestion(suggestion: CityOption) {
    this.form.city = suggestion.name;
    this.cityError = '';
    this.citySuggestions = [];
    if (this.cityDropdownCloseTimeout) {
      clearTimeout(this.cityDropdownCloseTimeout);
    }
    this.cityDropdownOpen = false;
    this.setLocation({ lat: suggestion.lat, lng: suggestion.lng });
  }

  onCategoryInput(value: string) {
    this.categoryInput = value;
    if (!value) {
      this.filteredCategories = this.categoryCatalog.slice(0, 6);
      this.categoryDropdownOpen = false;
      this.form.category = '';
      this.categoryTouched = false;
      this.form.title = '';
      this.titleSearch = '';
      this.filteredTitleSuggestions = [];
      return;
    }
    const normalized = value.trim().toLowerCase();
    this.filteredCategories = this.categoryCatalog
      .filter(category => category.toLowerCase().includes(normalized))
      .slice(0, 6);
    this.categoryDropdownOpen = this.filteredCategories.length > 0;
    const match = this.findCategoryOption(value);
    if (match) {
      this.categoryInput = match;
      this.form.category = match;
      this.categoryTouched = false;
      this.syncTitleControls();
    } else {
      this.form.category = '';
      this.form.title = '';
      this.titleSearch = '';
      this.filteredTitleSuggestions = [];
      this.categoryTouched = !!value;
    }
  }

  selectCategory(category: string) {
    this.categoryInput = category;
    this.form.category = category;
    this.categoryDropdownOpen = false;
    this.categoryTouched = false;
    if (this.categoryDropdownCloseTimeout) {
      clearTimeout(this.categoryDropdownCloseTimeout);
    }
    this.syncTitleControls();
  }

  openCategoryDropdown() {
    if (this.categoryDropdownCloseTimeout) {
      clearTimeout(this.categoryDropdownCloseTimeout);
    }
    if (!this.categoryInput) {
      this.filteredCategories = this.categoryCatalog.slice(0, 6);
    }
    this.categoryDropdownOpen = this.filteredCategories.length > 0;
  }

  closeCategoryDropdownSoon() {
    if (this.categoryDropdownCloseTimeout) {
      clearTimeout(this.categoryDropdownCloseTimeout);
    }
    this.categoryDropdownCloseTimeout = setTimeout(() => {
      this.categoryDropdownOpen = false;
      if (this.categoryInput && !this.validateCategory()) {
        this.categoryTouched = true;
      }
    }, 150);
  }

  private validateCategory() {
    return !!this.findCategoryOption(this.form.category);
  }

  private resolveContactPhone(currentUser: { phoneNumber?: string } | null) {
    const storeUser = this.auth.user$.value;
    const storePhone = typeof storeUser?.phone === 'string' ? storeUser.phone : '';
    const firebasePhone = typeof currentUser?.phoneNumber === 'string' ? currentUser.phoneNumber : '';
    return storePhone || firebasePhone || this.form.contact || '';
  }

  private applyCityMatch(value: string | undefined | null) {
    const match = this.findCityOption(value);
    if (match) {
      this.form.city = match.name;
      this.cityError = '';
      return true;
    }
    this.cityError = value ? 'Ville non prise en charge. Choisis une ville proposée.' : 'Ville obligatoire.';
    return false;
  }

  private findCityOption(value: string | undefined | null): CityOption | undefined {
    const trimmed = (value || '').trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    return this.cityCatalog.find(option => {
      if (option.name.toLowerCase() === lower) return true;
      return (option.aliases ?? []).some(alias => alias.toLowerCase() === lower);
    });
  }

  private findCategoryOption(value: string | undefined | null): string | undefined {
    const trimmed = (value || '').trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    const match = this.categoryCatalog.find(category => category.toLowerCase() === lower);
    return match;
  }

  private extractCity(result: any): string {
    const address = result?.address;
    if (!address) return '';
    return (
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.state ||
      address.county ||
      ''
    ).toString().trim();
  }

  get hasActiveAvailability() {
    return this.availability.days.some(day => day.enabled && this.isValidRange(day));
  }

  private buildAvailabilityPayload(): ServiceAvailability | null {
    const days = this.availability.days
      .filter(day => day.enabled && this.isValidRange(day))
      .map(day => ({
        day: day.day,
        start: day.start,
        end: day.end,
      }));
    if (!days.length) return null;
    return {
      durationMinutes: this.clampDuration(this.availability.durationMinutes),
      days,
    };
  }

  private patchAvailability(availability: ServiceAvailability | null) {
    this.initAvailability();
    if (!availability || !Array.isArray(availability.days)) {
      return;
    }
    this.availability.durationMinutes = this.clampDuration(availability.durationMinutes);
    this.availability.days = this.weekDays.map(day => {
      const existing = availability.days.find(slot => slot.day === day.value);
      if (existing) {
        return {
          day: day.value,
          start: existing.start,
          end: existing.end,
          enabled: true,
        };
      }
      return {
        day: day.value,
        start: '09:00',
        end: '18:00',
        enabled: false,
      };
    });
  }

  private isValidRange(day: AvailabilityFormDay) {
    return this.timeToMinutes(day.end) > this.timeToMinutes(day.start);
  }

  private timeToMinutes(value: string) {
    const [h, m] = value.split(':').map(part => parseInt(part, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  }

  private clampDuration(value?: number | null) {
    const base = typeof value === 'number' && !Number.isNaN(value) ? value : 30;
    return Math.min(480, Math.max(30, base));
  }

  dayLabel(dayValue: number) {
    const found = this.weekDays.find(day => day.value === dayValue);
    return found?.label ?? '';
  }

  get titleSuggestions(): string[] {
    return this.getCurrentSuggestions();
  }

  onTitleFocus() {
    if (!this.validateCategory()) {
      this.categoryTouched = true;
      this.openCategoryDropdown();
      this.titleDropdownOpen = false;
      return;
    }
    this.clearTitleCloseTimeout();
    this.updateFilteredTitle(this.titleSearch);
    this.titleDropdownOpen = this.filteredTitleSuggestions.length > 0;
  }

  onTitleBlur() {
    this.clearTitleCloseTimeout();
    this.titleDropdownCloseTimeout = setTimeout(() => {
      this.titleDropdownOpen = false;
    }, 120);
  }

  onTitleInput(value: string) {
    if (!this.validateCategory()) {
      this.categoryTouched = true;
      this.openCategoryDropdown();
      this.titleDropdownOpen = false;
      return;
    }
    this.titleTouched = true;
    this.titleSearch = value;
    this.updateFilteredTitle(value);
    const suggestions = this.getCurrentSuggestions();
    if (suggestions.includes(value)) {
      this.form.title = value;
      this.titleDropdownOpen = false;
    } else {
      this.form.title = '';
      this.titleDropdownOpen = this.filteredTitleSuggestions.length > 0;
    }
  }

  selectTitleSuggestion(option: string) {
    this.form.title = option;
    this.titleSearch = option;
    this.titleDropdownOpen = false;
    this.titleTouched = false;
  }

  get isTitleInvalid() {
    return this.titleTouched && !this.form.title;
  }

  private updateFilteredTitle(query: string) {
    const normalized = (query || '').toLowerCase();
    const options = this.getCurrentSuggestions();
    this.filteredTitleSuggestions = options.filter(option =>
      option.toLowerCase().includes(normalized),
    );
  }

  private openTitleDropdown() {
    if (!this.validateCategory()) {
      this.categoryTouched = true;
      this.openCategoryDropdown();
      return;
    }
    this.updateFilteredTitle(this.titleSearch);
    this.titleDropdownOpen = this.filteredTitleSuggestions.length > 0;
  }

  private syncTitleControls() {
    if (!this.validateCategory()) {
      this.form.title = '';
      this.titleSearch = '';
      this.filteredTitleSuggestions = [];
      this.titleDropdownOpen = false;
      this.titleTouched = false;
      return;
    }
    const suggestions = this.getCurrentSuggestions();
    if (this.form.title && !suggestions.includes(this.form.title)) {
      this.form.title = '';
      this.titleSearch = '';
    } else {
      this.titleSearch = this.form.title;
    }
    this.updateFilteredTitle(this.titleSearch);
    this.titleTouched = false;
  }

  private ensureTitleInSuggestions(title: string, category: string) {
    if (!title || !category) return;
    const suggestions = this.serviceSuggestions[category];
    if (!suggestions) {
      this.serviceSuggestions[category] = [title];
      return;
    }
    if (!suggestions.includes(title)) {
      this.serviceSuggestions[category] = [...suggestions, title];
    }
  }

  private getCurrentSuggestions(): string[] {
    if (!this.validateCategory()) return [];
    return this.serviceSuggestions[this.form.category] ?? this.serviceSuggestions['default'];
  }

  private clearTitleCloseTimeout() {
    if (this.titleDropdownCloseTimeout) {
      clearTimeout(this.titleDropdownCloseTimeout);
      this.titleDropdownCloseTimeout = undefined;
    }
  }
}
