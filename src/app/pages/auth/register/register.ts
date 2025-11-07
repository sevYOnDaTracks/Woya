import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';  // ✅ ICI
import { firebaseServices } from '../../../app.config';
import { createUserWithEmailAndPassword, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AuthStore } from '../../../core/store/auth.store';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule], // ✅ AJOUTE CommonModule ICI
  templateUrl: './register.html'
})
export default class Register implements OnInit, OnDestroy {

  form = {
    firstname: '',
    lastname: '',
    pseudo: '',
    profession: '',
    email: '',
    password: '',
    countryCode: '+225',
    phone: '',
    birthdate: '',
    city: '',
    address: '',
  };

  preview: string | null = null;
  file: File | null = null;
  loading = false;
  error = '';
  showBirthdatePicker = false;
  isLoggedIn = false;
  private authSub?: Subscription;

  constructor(private router: Router, private authStore: AuthStore) {}

  ngOnInit() {
    this.authSub = this.authStore.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      if (this.isLoggedIn) {
        this.router.navigate(['/services']);
      }
    });
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  selectProfileImage(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    this.file = f;

    const reader = new FileReader();
    reader.onload = () => this.preview = reader.result as string;
    reader.readAsDataURL(f);
  }

  async register() {
    this.loading = true;
    this.error = '';

    try {
      const auth = firebaseServices.auth;
      const db = firebaseServices.db;
      const storage = getStorage();

      await this.ensureUniqueEmail(db, this.form.email);
      await this.ensureUniquePhone(db, this.form.countryCode + this.form.phone);

      const cred = await createUserWithEmailAndPassword(auth, this.form.email, this.form.password);

      let photoURL = '';
      if (this.file) {
        const refImg = ref(storage, `users/${cred.user.uid}/profile.jpg`);
        await uploadBytes(refImg, this.file);
        photoURL = await getDownloadURL(refImg);
      }

      await setDoc(doc(db, 'users', cred.user.uid), {
        ...this.form,
        pseudo: this.form.pseudo.trim(),
        profession: this.form.profession.trim(),
        phone: `${this.form.countryCode}${this.form.phone}`,
        city: this.form.city,
        address: this.form.address,
        coverURL: '',
        searchKeywords: this.buildSearchKeywords({
          firstname: this.form.firstname,
          lastname: this.form.lastname,
          pseudo: this.form.pseudo,
        }),
        photoURL,
        createdAt: Date.now()
      });

      this.router.navigate(['/services']);

    } catch (err) {
      this.error = "Impossible de créer le compte.";
    }

    this.loading = false;
  }

  private async ensureUniqueEmail(db: any, email: string) {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      throw new Error('email-exists');
    }
  }

  private async ensureUniquePhone(db: any, phone: string) {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('phone', '==', phone));
    const snap = await getDocs(q);
    if (!snap.empty) {
      throw new Error('phone-exists');
    }
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

  loginWithGoogle() {
    signInWithPopup(firebaseServices.auth, new GoogleAuthProvider());
  }

  loginWithFacebook() {
    signInWithPopup(firebaseServices.auth, new FacebookAuthProvider());
  }

  toggleBirthdatePicker() {
    this.showBirthdatePicker = !this.showBirthdatePicker;
  }
}
