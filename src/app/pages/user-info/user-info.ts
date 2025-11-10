import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { doc, setDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

import { AuthStore } from '../../core/store/auth.store';
import { firebaseServices } from '../../app.config';
import { ProfilesService, GalleryAlbum } from '../../core/services/profiles';
import { LoadingIndicatorService } from '../../core/services/loading-indicator.service';

type AccountSection = 'photos' | 'infos' | 'galerie';

interface UserInfoForm {
  firstname: string;
  lastname: string;
  pseudo: string;
  profession: string;
  birthdate: string;
  phone: string;
  city: string;
  address: string;
  bio: string;
}

interface GalleryUploadState {
  caption: string;
  file: File | null;
  uploading: boolean;
}

@Component({
  selector: 'app-user-info',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css',
})
export default class UserInfo implements OnInit, OnDestroy {

  form: UserInfoForm = {
    firstname: '',
    lastname: '',
    pseudo: '',
    profession: '',
    birthdate: '',
    phone: '',
    city: '',
    address: '',
    bio: ''
  };

  loading = false;
  success = '';
  error = '';
  photoPreview: string | null = null;
  photoFile: File | null = null;
  coverPreview: string | null = null;
  coverFile: File | null = null;
  galleries: GalleryAlbum[] = [];
  galleryLoading = false;
  galleryError = '';
  newGalleryTitle = '';
  newGalleryDescription = '';
  creatingGallery = false;
  galleryUploads: Record<string, GalleryUploadState> = {};
  maxPhotosPerGallery = 5;
  activeSection: AccountSection = 'photos';

  private sub?: Subscription;
  private sectionSub?: Subscription;
  user: any = null;

  constructor(
    private auth: AuthStore,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private profiles: ProfilesService,
    private loadingIndicator: LoadingIndicatorService,
  ) {}

  ngOnInit() {
    this.sub = this.auth.user$.subscribe(user => {
      this.user = user;
      if (user) {
        this.populateForm(user);
        this.loadGalleries();
      }
    });

    this.sectionSub = this.route.paramMap.subscribe(params => {
      const raw = params.get('section');
      const normalized = this.normalizeSection(raw);
      this.activeSection = normalized;
      if (raw !== normalized) {
        this.router.navigate(['/mon-compte', normalized], { replaceUrl: true });
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.sectionSub?.unsubscribe();
  }

  get isLoggedIn() {
    return !!this.user;
  }

  private populateForm(user: any) {
    this.form = {
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      pseudo: user.pseudo || '',
      profession: user.profession || '',
      birthdate: user.birthdate || '',
      phone: user.phone || '',
      city: user.city || '',
      address: user.address || '',
      bio: user.bio || ''
    };
    this.photoPreview = user.photoURL || null;
    this.coverPreview = user.coverURL || null;
    this.newGalleryTitle = '';
    this.newGalleryDescription = '';
    this.galleryUploads = {};
  }

  resetForm() {
    if (!this.user) return;
    this.populateForm(this.user);
    this.success = '';
    this.error = '';
    this.photoFile = null;
    this.coverFile = null;
  }

  async save() {
    if (!this.user) {
      this.error = 'Veuillez vous connecter pour modifier vos informations.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const payload: any = {
      firstname: this.form.firstname.trim(),
      lastname: this.form.lastname.trim(),
      pseudo: this.form.pseudo.trim(),
      profession: this.form.profession.trim(),
      birthdate: this.form.birthdate || null,
      phone: this.form.phone.trim(),
      city: this.form.city.trim(),
      address: this.form.address.trim(),
      bio: this.form.bio.trim(),
      searchKeywords: this.buildSearchKeywords({
        firstname: this.form.firstname,
        lastname: this.form.lastname,
        pseudo: this.form.pseudo,
      }),
      updatedAt: Date.now()
    };

    try {
      if (this.photoFile) {
        const storage = getStorage();
        const avatarRef = storageRef(storage, `users/${this.user.uid}/profile.jpg`);
        await uploadBytes(avatarRef, this.photoFile);
        payload['photoURL'] = await getDownloadURL(avatarRef);
        this.photoPreview = payload['photoURL'];
        this.photoFile = null;
      }

      if (this.coverFile) {
        payload['coverURL'] = await this.profiles.saveCover(this.user.uid, this.coverFile);
        this.coverPreview = payload['coverURL'];
        this.coverFile = null;
      }

      const ref = doc(firebaseServices.db, 'users', this.user.uid);
      await setDoc(ref, payload, { merge: true });

      this.auth.user$.next({ ...this.user, ...payload });
      this.success = 'Informations mises à jour avec succès.';
    } catch (err) {
      this.error = "Impossible d'enregistrer les modifications pour le moment.";
    } finally {
      this.loading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goBack() {
    const canGoBack = typeof window !== 'undefined' ? window.history.length > 1 : false;
    if (canGoBack) {
      this.location.back();
    } else {
      this.router.navigate(['/services']);
    }
  }

  private normalizeSection(value: string | null): AccountSection {
    switch (value) {
      case 'infos':
        return 'infos';
      case 'galerie':
        return 'galerie';
      case 'photos':
      default:
        return 'photos';
    }
  }

  onSelectPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const message = 'Seules les images (PNG, JPG, WebP, etc.) sont autorisées pour la photo de profil.';
    if (!this.isImageFile(file)) {
      this.photoFile = null;
      input.value = '';
      this.error = message;
      this.success = '';
      return;
    }
    if (this.error === message) {
      this.error = '';
    }
    this.photoFile = file;
    const reader = new FileReader();
    reader.onload = () => this.photoPreview = reader.result as string;
    reader.readAsDataURL(file);
  }

  clearPhotoSelection() {
    this.photoFile = null;
    this.photoPreview = this.user?.photoURL || null;
  }

  async removeProfilePhoto() {
    if (!this.user) return;
    this.loading = true;
    this.error = '';
    try {
      const storage = getStorage();
      const avatarRef = storageRef(storage, `users/${this.user.uid}/profile.jpg`);
      await deleteObject(avatarRef).catch(() => null);

      const ref = doc(firebaseServices.db, 'users', this.user.uid);
      await setDoc(ref, { photoURL: '', updatedAt: Date.now() }, { merge: true });

      this.photoFile = null;
      this.photoPreview = null;
      this.auth.user$.next({ ...this.user, photoURL: '' });
      this.success = 'Photo de profil supprimée.';
    } catch {
      this.error = 'Impossible de supprimer la photo de profil.';
    } finally {
      this.loading = false;
    }
  }

  onSelectCover(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const message = 'La photo de couverture doit obligatoirement être une image (PNG, JPG, WebP, etc.).';
    if (!this.isImageFile(file)) {
      this.coverFile = null;
      input.value = '';
      this.error = message;
      this.success = '';
      return;
    }
    if (this.error === message) {
      this.error = '';
    }
    this.coverFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.coverPreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  clearCoverSelection() {
    this.coverFile = null;
    this.coverPreview = this.user?.coverURL || null;
  }

  async removeCoverPhoto() {
    if (!this.user) return;
    this.loading = true;
    this.error = '';
    try {
      const storage = getStorage();
      const coverRef = storageRef(storage, `users/${this.user.uid}/cover.jpg`);
      await deleteObject(coverRef).catch(() => null);

      const ref = doc(firebaseServices.db, 'users', this.user.uid);
      await setDoc(ref, { coverURL: '', updatedAt: Date.now() }, { merge: true });

      this.coverFile = null;
      this.coverPreview = null;
      this.auth.user$.next({ ...this.user, coverURL: '' });
      this.success = 'Photo de couverture supprimée.';
    } catch {
      this.error = 'Impossible de supprimer la photo de couverture.';
    } finally {
      this.loading = false;
    }
  }

  async loadGalleries() {
    if (!this.user) return;
    this.galleryLoading = true;
    this.galleryError = '';
    this.loadingIndicator.show();
    try {
      this.galleries = await this.profiles.getGalleries(this.user.uid);
    } catch (error) {
      this.galleryError = 'Impossible de charger les galeries.';
    } finally {
      this.galleryLoading = false;
      this.loadingIndicator.hide();
    }
  }

  async createGallery() {
    if (!this.user) return;
    const title = this.newGalleryTitle.trim();
    if (!title) {
      this.galleryError = 'Choisis un nom pour ta galerie.';
      return;
    }
    this.galleryError = '';
    this.creatingGallery = true;
    this.loadingIndicator.show();
    try {
      await this.profiles.createGallery(this.user.uid, title, this.newGalleryDescription.trim());
      this.newGalleryTitle = '';
      this.newGalleryDescription = '';
      await this.loadGalleries();
    } catch (error) {
      this.galleryError = 'Impossible de créer cette galerie.';
    } finally {
      this.creatingGallery = false;
      this.loadingIndicator.hide();
    }
  }

  onSelectGalleryFile(galleryId: string, event: Event) {
    const state = this.ensureGalleryUploadState(galleryId);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const message = 'La galerie n’accepte que des images (PNG, JPG, WebP, etc.).';
    if (file && !this.isImageFile(file)) {
      state.file = null;
      this.galleryError = message;
      input.value = '';
      return;
    }
    if (this.galleryError === message) {
      this.galleryError = '';
    }
    state.file = file;
  }

  async uploadGalleryPhoto(galleryId: string) {
    if (!this.user) return;
    const state = this.ensureGalleryUploadState(galleryId);
    if (!state.file) {
      this.galleryError = 'Choisis une image avant de l\'ajouter.';
      return;
    }
    this.galleryError = '';
    state.uploading = true;
    this.loadingIndicator.show();
    try {
      await this.profiles.addGalleryPhoto(this.user.uid, galleryId, state.file, state.caption.trim());
      this.galleryUploads[galleryId] = { caption: '', file: null, uploading: false };
      await this.loadGalleries();
    } catch (error: any) {
      this.galleryError = error?.message || 'Impossible d\'ajouter cette image.';
      state.uploading = false;
    } finally {
      this.loadingIndicator.hide();
    }
  }

  async removeGalleryPhoto(galleryId: string, photoId: string) {
    if (!this.user) return;
    this.galleryError = '';
    this.loadingIndicator.show();
    try {
      await this.profiles.removeGalleryPhoto(this.user.uid, galleryId, photoId);
      await this.loadGalleries();
    } catch {
      this.galleryError = 'Suppression impossible pour le moment.';
    } finally {
      this.loadingIndicator.hide();
    }
  }

  async deleteGallery(galleryId: string) {
    if (!this.user) return;
    this.galleryError = '';
    this.loadingIndicator.show();
    try {
      await this.profiles.deleteGallery(this.user.uid, galleryId);
      delete this.galleryUploads[galleryId];
      await this.loadGalleries();
    } catch {
      this.galleryError = 'Impossible de supprimer cette galerie.';
    } finally {
      this.loadingIndicator.hide();
    }
  }

  private ensureGalleryUploadState(galleryId: string): GalleryUploadState {
    if (!this.galleryUploads[galleryId]) {
      this.galleryUploads[galleryId] = { caption: '', file: null, uploading: false };
    }
    return this.galleryUploads[galleryId];
  }

  galleryUploadState(galleryId: string) {
    return this.ensureGalleryUploadState(galleryId);
  }

  private buildSearchKeywords(values: { firstname?: string; lastname?: string; pseudo?: string }) {
    const tokens = new Set<string>();
    const addValue = (value?: string) => {
      if (!value) return;
      const normalized = value.trim().toLowerCase();
      if (!normalized) return;
      tokens.add(normalized);
      normalized.split(/[\s-]+/).forEach(part => {
        if (part) tokens.add(part);
      });
    };
    addValue(values.pseudo);
    addValue(values.firstname);
    addValue(values.lastname);
    addValue(`${values.firstname ?? ''} ${values.lastname ?? ''}`);
    return Array.from(tokens);
  }

  private isImageFile(file: File) {
    const mime = (file.type || '').toLowerCase();
    if (mime) {
      return mime.startsWith('image/');
    }
    const extension = file.name ? file.name.toLowerCase() : '';
    return /\.(png|jpe?g|gif|bmp|webp|avif|heic|heif)$/.test(extension);
  }
}
