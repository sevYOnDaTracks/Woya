import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';

// ✅ Firebase
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Services } from '../../core/services/services';
import { AuthStore } from '../../core/store/auth.store';
import { firebaseServices } from '../../app.config';
import { WoyaService } from '../../core/models/service.model';

@Component({
  selector: 'app-new-service',
  standalone: true,
  imports: [CommonModule, FormsModule , RouterLink],
  templateUrl: './new-service.html'
})
export default class NewService implements OnInit {

  loading = false;
  editing = false;
  serviceId: string | null = null;
  existingCoverUrl: string | null = null;
  existingExtraImages: string[] = [];
  existingImages: string[] = [];

  // ✅ MULTI IMAGE
  files: File[] = [];
  previews: string[] = [];

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
    private location: Location
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
    if (!this.form.title || !this.form.city || !this.form.contact) return;
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

    const normalizedCover = coverUrl ?? undefined;
    const normalizedExtra = extraImages.filter((img): img is string => !!img);

    const data = {
      ...this.form,
      coverUrl: normalizedCover,
      extraImages: normalizedExtra,
      ownerId: currentUser.uid,
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
  }

}
