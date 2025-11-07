import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { doc, setDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import { AuthStore } from '../../core/store/auth.store';
import { firebaseServices } from '../../app.config';

interface UserInfoForm {
  firstname: string;
  lastname: string;
  birthdate: string;
  phone: string;
  city: string;
  address: string;
  bio: string;
}

@Component({
  selector: 'app-user-info',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css',
})
export default class UserInfo implements OnInit, OnDestroy {

  form: UserInfoForm = {
    firstname: '',
    lastname: '',
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

  private sub?: Subscription;
  user: any = null;

  constructor(private auth: AuthStore, private router: Router, private location: Location) {}

  ngOnInit() {
    this.sub = this.auth.user$.subscribe(user => {
      this.user = user;
      if (user) {
        this.populateForm(user);
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  get isLoggedIn() {
    return !!this.user;
  }

  private populateForm(user: any) {
    this.form = {
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      birthdate: user.birthdate || '',
      phone: user.phone || '',
      city: user.city || '',
      address: user.address || '',
      bio: user.bio || ''
    };
    this.photoPreview = user.photoURL || null;
  }

  resetForm() {
    if (!this.user) return;
    this.populateForm(this.user);
    this.success = '';
    this.error = '';
    this.photoFile = null;
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
      birthdate: this.form.birthdate || null,
      phone: this.form.phone.trim(),
      city: this.form.city.trim(),
      address: this.form.address.trim(),
      bio: this.form.bio.trim(),
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

  onSelectPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.photoFile = file;
    const reader = new FileReader();
    reader.onload = () => this.photoPreview = reader.result as string;
    reader.readAsDataURL(file);
  }

  clearPhotoSelection() {
    this.photoFile = null;
    this.photoPreview = this.user?.photoURL || null;
  }

}
