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

  confirmPassword = '';
  preview: string | null = null;
  file: File | null = null;
  loading = false;
  error = '';
  showBirthdatePicker = false;
  showPassword = false;
  showConfirmPassword = false;
  passwordCriteria = {
    minLength: false,
    uppercase: false,
    digit: false,
    special: false,
  };
  emailStatus: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error' = 'idle';
  phoneStatus: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error' = 'idle';
  isLoggedIn = false;
  private authSub?: Subscription;
  private emailCheckTimeout?: ReturnType<typeof setTimeout>;
  private phoneCheckTimeout?: ReturnType<typeof setTimeout>;

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
    if (this.emailCheckTimeout) {
      clearTimeout(this.emailCheckTimeout);
    }
    if (this.phoneCheckTimeout) {
      clearTimeout(this.phoneCheckTimeout);
    }
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
    this.error = '';

    if (!this.isPasswordValid) {
      this.error = 'Le mot de passe ne respecte pas les critères requis.';
      return;
    }

    if (!this.passwordsMatch) {
      this.error = 'Les mots de passe ne correspondent pas.';
      return;
    }

    if (!this.isValidEmail(this.form.email)) {
      this.error = 'Adresse email invalide.';
      return;
    }

    const phone = this.buildFullPhoneNumber();
    if (!this.isValidPhone(phone)) {
      this.error = 'Numéro de téléphone invalide.';
      return;
    }

    this.loading = true;

    try {
      const auth = firebaseServices.auth;
      const db = firebaseServices.db;
      const storage = getStorage();
      this.form.email = this.form.email.trim().toLowerCase();

      await this.ensureUniqueEmail(db, this.form.email);
      await this.ensureUniquePhone(db, phone);

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
        phone,
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
      const code = (err as any)?.code || (err as Error)?.message;
      if (code === 'email-exists' || code === 'auth/email-already-in-use') {
        this.emailStatus = 'taken';
        this.error = "Cette adresse e-mail est déjà utilisée.";
      } else if (code === 'phone-exists') {
        this.phoneStatus = 'taken';
        this.error = "Ce numéro de téléphone est déjà utilisé.";
      } else if (code === 'auth/weak-password') {
        this.error = "Le mot de passe est trop faible.";
      } else {
        this.error = "Impossible de créer le compte.";
      }
    } finally {
      this.loading = false;
    }

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

  onPasswordChange(value: string) {
    this.updatePasswordCriteria(value);
  }

  onConfirmPasswordChange() {
    // Trigger change detection for password match indicator.
  }

  get isPasswordValid() {
    return Object.values(this.passwordCriteria).every(Boolean);
  }

  get passwordsMatch() {
    return !!this.form.password && !!this.confirmPassword && this.form.password === this.confirmPassword;
  }

  togglePasswordVisibility(field: 'password' | 'confirm') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onEmailChange(value: string) {
    if (this.emailCheckTimeout) {
      clearTimeout(this.emailCheckTimeout);
    }
    if (!value) {
      this.emailStatus = 'idle';
      return;
    }
    this.emailStatus = 'checking';
    const email = value.trim().toLowerCase();
    this.emailCheckTimeout = setTimeout(() => this.checkEmailAvailability(email), 400);
  }

  onPhoneChange() {
    if (this.phoneCheckTimeout) {
      clearTimeout(this.phoneCheckTimeout);
    }
    const phone = this.buildFullPhoneNumber();
    if (!this.form.phone) {
      this.phoneStatus = 'idle';
      return;
    }
    this.phoneStatus = 'checking';
    this.phoneCheckTimeout = setTimeout(() => this.checkPhoneAvailability(phone), 400);
  }

  private async checkEmailAvailability(email: string) {
    if (this.form.email.trim().toLowerCase() !== email) {
      return;
    }
    if (!this.isValidEmail(email)) {
      this.emailStatus = 'invalid';
      return;
    }
    try {
      await this.ensureUniqueEmail(firebaseServices.db, email);
      this.emailStatus = 'available';
    } catch (err) {
      const message = (err as Error).message;
      this.emailStatus = message === 'email-exists' ? 'taken' : 'error';
    }
  }

  private async checkPhoneAvailability(phone: string) {
    if (this.buildFullPhoneNumber() !== phone) {
      return;
    }
    if (!this.isValidPhone(phone)) {
      this.phoneStatus = 'invalid';
      return;
    }
    try {
      await this.ensureUniquePhone(firebaseServices.db, phone);
      this.phoneStatus = 'available';
    } catch (err) {
      const message = (err as Error).message;
      this.phoneStatus = message === 'phone-exists' ? 'taken' : 'error';
    }
  }

  private updatePasswordCriteria(password: string) {
    this.passwordCriteria = {
      minLength: password.length >= 6,
      uppercase: /[A-Z]/.test(password),
      digit: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string) {
    return /^\+\d{6,15}$/.test(phone);
  }

  private buildFullPhoneNumber() {
    const localPhone = (this.form.phone || '').replace(/\D+/g, '');
    return `${this.form.countryCode}${localPhone}`;
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
