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
import { WoyaService } from '../../core/models/service.model';
import { HttpClient, HttpClientModule } from '@angular/common/http';

type CitySuggestion = { displayName: string; lat: number; lng: number };

@Component({
  selector: 'app-new-service',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './new-service.html'
})
export default class NewService implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  private readonly defaultCoverIcon = 'assets/icone.png';
  loading = false;
  editing = false;
  serviceId: string | null = null;
  existingCoverUrl: string | null = null;
  existingExtraImages: string[] = [];
  existingImages: string[] = [];

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
  citySuggestions: CitySuggestion[] = [];
  private cityLookupAbort?: AbortController;

  categories = [
    'Jardinage', 'Ménage & Aide à domicile', 'Cours particuliers',
    'Transport & Déménagement', 'Informatique', 'Bricolage / Réparation',
    'Beauté & Bien-être', 'Garde d’enfants',
  ];

  form = {
    title: '',
    description: '',
    category: 'Jardinage',
    city: '',
    price: null as number | null,
    contact: '',
  };

  constructor(
    private api: Services,
    private router: Router,
    private auth: AuthStore,
    private route: ActivatedRoute,
    private location: Location,
    private http: HttpClient
  ) {}

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
    }
  }

  ngAfterViewInit() {
    this.initMap();
    this.useDeviceLocation();
  }

  ngOnDestroy() {
    this.map?.remove();
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
    if (!this.form.title || !this.form.city) return;
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
  const files = Array.from(event.dataTransfer?.files || [] as File[])
  .filter((f: File) => f.type.startsWith('image/'));

  this.handleFiles(files);
}

onSelectImages(event: any) {
  const files = Array.from(event.target.files as File[])
  .filter((f: File) => f.type.startsWith('image/'));

  this.handleFiles(files);
}

handleFiles(files: File[]) {
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
      this.locationError = 'La géolocalisation n’est pas disponible sur ce navigateur.';
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
          if (result?.display_name) {
            this.form.city = result.display_name;
          }
        },
      });
  }

  fillCityFromLocation() {
    if (!this.currentLocation) {
      this.locationError = 'Aucune position disponible. Clique sur “Utiliser ma position” d’abord.';
      return;
    }
    this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
  }

  onCityInput(value: string) {
    this.form.city = value;
    if (!value || value.length < 3) {
      this.citySuggestions = [];
      this.cityLookupAbort?.abort();
      return;
    }

    this.cityLookupAbort?.abort();
    const controller = new AbortController();
    this.cityLookupAbort = controller;
    const params = new URLSearchParams({
      q: value,
      format: 'json',
      addressdetails: '1',
      countrycodes: 'ci',
      limit: '5',
    });
    fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'Accept-Language': 'fr' },
      signal: controller.signal,
    })
      .then(response => response.json() as Promise<any[]>)
      .then(results => {
        if (this.cityLookupAbort !== controller) return;
        this.citySuggestions = results.map(item => ({
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }));
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        this.citySuggestions = [];
      });
  }

  selectCitySuggestion(suggestion: CitySuggestion) {
    this.form.city = suggestion.displayName;
    this.setLocation({ lat: suggestion.lat, lng: suggestion.lng });
    this.citySuggestions = [];
  }

  private resolveContactPhone(currentUser: { phoneNumber?: string } | null) {
    const storeUser = this.auth.user$.value;
    const storePhone = typeof storeUser?.phone === 'string' ? storeUser.phone : '';
    const firebasePhone = typeof currentUser?.phoneNumber === 'string' ? currentUser.phoneNumber : '';
    return storePhone || firebasePhone || this.form.contact || '';
  }

}
