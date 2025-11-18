import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';  // ✅ ICI
import { firebaseServices } from '../../../app.config';
import { createUserWithEmailAndPassword, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs, getDoc, limit } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AuthStore } from '../../../core/store/auth.store';
import { matchProfessionOption, OTHER_PROFESSION_OPTION, PROFESSION_OPTIONS, resolveProfessionValue } from '../../../core/constants/professions';
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
  professionOptions = PROFESSION_OPTIONS;
  readonly professionOtherValue = OTHER_PROFESSION_OPTION;
  selectedProfession = '';
  customProfession = '';
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
  pseudoStatus: 'idle' | 'checking' | 'available' | 'taken' | 'error' = 'idle';
  isLoggedIn = false;
  private authSub?: Subscription;
  private emailCheckTimeout?: ReturnType<typeof setTimeout>;
  private phoneCheckTimeout?: ReturnType<typeof setTimeout>;
  private pseudoCheckTimeout?: ReturnType<typeof setTimeout>;
  showProfilePrompt = false;
  profilePrompt = {
    firstname: '',
    lastname: '',
    pseudo: '',
    phone: '',
  };
  profilePromptError = '';
  profilePromptPseudoStatus: 'idle' | 'checking' | 'available' | 'taken' | 'error' = 'idle';
  private pendingSocialUser: User | null = null;
  private profilePromptPseudoTimeout?: ReturnType<typeof setTimeout>;

  constructor(private router: Router, private authStore: AuthStore) {}

  ngOnInit() {
    this.authSub = this.authStore.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      if (this.isLoggedIn) {
        this.router.navigate(['/mon-espace']);
      }
    });
    this.syncProfessionSelection(this.form.profession);
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
    if (this.emailCheckTimeout) {
      clearTimeout(this.emailCheckTimeout);
    }
    if (this.phoneCheckTimeout) {
      clearTimeout(this.phoneCheckTimeout);
    }
    if (this.pseudoCheckTimeout) {
      clearTimeout(this.pseudoCheckTimeout);
    }
    if (this.profilePromptPseudoTimeout) {
      clearTimeout(this.profilePromptPseudoTimeout);
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

    const trimmedPseudo = this.form.pseudo.trim();
    if (!trimmedPseudo) {
      this.error = 'Merci de choisir un pseudo.';
      return;
    }

    const profession = this.getResolvedProfession();
    if (!profession) {
      this.error = 'Merci de choisir ou saisir une profession.';
      return;
    }
    this.form.profession = profession;

    this.loading = true;

    try {
      const auth = firebaseServices.auth;
      const db = firebaseServices.db;
      const storage = getStorage();
      this.form.email = this.form.email.trim().toLowerCase();
      this.form.pseudo = trimmedPseudo;

      await this.ensureUniqueEmail(db, this.form.email);
      await this.ensureUniquePhone(db, phone);
      await this.ensureUniquePseudo(db, trimmedPseudo);

      const cred = await createUserWithEmailAndPassword(auth, this.form.email, this.form.password);

      let photoURL = '';
      if (this.file) {
        const refImg = ref(storage, `users/${cred.user.uid}/profile.jpg`);
        await uploadBytes(refImg, this.file);
        photoURL = await getDownloadURL(refImg);
      }

      const pseudoLower = trimmedPseudo.toLowerCase();

      await setDoc(doc(db, 'users', cred.user.uid), {
        ...this.form,
        pseudo: trimmedPseudo,
        pseudoLowercase: pseudoLower,
        profession: this.form.profession,
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

      this.router.navigate(['/mon-espace']);

    } catch (err) {
      const code = (err as any)?.code || (err as Error)?.message;
      if (code === 'email-exists' || code === 'auth/email-already-in-use') {
        this.emailStatus = 'taken';
        this.error = "Cette adresse e-mail est déjà utilisée.";
      } else if (code === 'phone-exists') {
        this.phoneStatus = 'taken';
        this.error = "Ce numéro de téléphone est déjà utilisé.";
      } else if (code === 'pseudo-exists') {
        this.pseudoStatus = 'taken';
        this.error = 'Ce pseudo est déjà utilisé.';
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

  private async ensureUniquePseudo(db: any, pseudo: string, excludeUid?: string) {
    const available = await this.checkPseudoAvailability(pseudo, excludeUid);
    if (!available) {
      const error: any = new Error('pseudo-exists');
      error.code = 'pseudo-exists';
      throw error;
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

  onPseudoChange(value: string) {
    this.form.pseudo = value;
    if (this.pseudoCheckTimeout) {
      clearTimeout(this.pseudoCheckTimeout);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      this.pseudoStatus = 'idle';
      return;
    }
    this.pseudoStatus = 'checking';
    this.pseudoCheckTimeout = setTimeout(async () => {
      try {
        const available = await this.checkPseudoAvailability(trimmed);
        this.pseudoStatus = available ? 'available' : 'taken';
      } catch (error) {
        console.error('Unable to check pseudo availability', error);
        this.pseudoStatus = 'error';
      }
    }, 350);
  }

  onProfilePromptPseudoChange(value: string) {
    this.profilePrompt.pseudo = value;
    if (this.profilePromptPseudoTimeout) {
      clearTimeout(this.profilePromptPseudoTimeout);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      this.profilePromptPseudoStatus = 'idle';
      return;
    }
    this.profilePromptPseudoStatus = 'checking';
    this.profilePromptPseudoTimeout = setTimeout(async () => {
      try {
        const available = await this.checkPseudoAvailability(trimmed);
        this.profilePromptPseudoStatus = available ? 'available' : 'taken';
      } catch (error) {
        console.error('Unable to check pseudo availability', error);
        this.profilePromptPseudoStatus = 'error';
      }
    }, 350);
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

  private async checkPseudoAvailability(pseudo: string, excludeUid?: string) {
    const normalized = pseudo.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    const usersCol = collection(firebaseServices.db, 'users');
    const qPseudo = query(usersCol, where('pseudoLowercase', '==', normalized), limit(1));
    const snap = await getDocs(qPseudo);
    if (snap.empty) {
      return true;
    }
    if (excludeUid && snap.docs[0].id === excludeUid) {
      return true;
    }
    return false;
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

  async loginWithGoogle() {
    this.error = '';
    this.loading = true;
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(firebaseServices.auth, provider);
      const user = credential.user;
      if (user) {
        this.hydrateFormFromProvider(user);
        const needsProfile = await this.needsProfileCompletion(user);
        if (needsProfile) {
          this.pendingSocialUser = user;
          this.prefillProfilePrompt();
          this.showProfilePrompt = true;
          return;
        }
        await this.ensureSocialUserDocument(user);
        this.router.navigate(['/mon-espace']);
      }
    } catch (error) {
      console.error('Google sign-in failed', error);
      this.error = 'Connexion Google impossible pour le moment.';
    } finally {
      this.loading = false;
    }
  }

  loginWithFacebook() {
    signInWithPopup(firebaseServices.auth, new FacebookAuthProvider());
  }

  onProfessionSelectChange(value: string) {
    this.selectedProfession = value;
    if (value !== this.professionOtherValue) {
      this.customProfession = '';
    }
  }

  toggleBirthdatePicker() {
    this.showBirthdatePicker = !this.showBirthdatePicker;
  }

  async submitProfilePrompt() {
    if (!this.pendingSocialUser) return;
    const { firstname, lastname, pseudo } = this.profilePrompt;
    if (!firstname.trim() || !lastname.trim() || !pseudo.trim()) {
      this.profilePromptError = 'Merci de renseigner prénom, nom et pseudo.';
      return;
    }
    if (this.profilePromptPseudoStatus === 'taken') {
      this.profilePromptError = 'Ce pseudo est déjà utilisé.';
      return;
    }
    this.profilePromptError = '';
    this.loading = true;
    try {
      await this.ensureSocialUserDocument(this.pendingSocialUser, {
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        pseudo: pseudo.trim(),
        phone: this.profilePrompt.phone.trim(),
      });
      this.showProfilePrompt = false;
      this.pendingSocialUser = null;
      this.router.navigate(['/mon-espace']);
    } catch (error) {
      console.error('Unable to save profile prompt', error);
      this.profilePromptError = 'Impossible de sauvegarder ces informations pour le moment.';
    } finally {
      this.loading = false;
    }
  }

  private hydrateFormFromProvider(user: User) {
    if (user.email) {
      this.form.email = user.email;
      this.emailStatus = 'available';
    }
    if (user.displayName) {
      const [firstname, ...rest] = user.displayName.split(' ');
      const lastname = rest.join(' ').trim();
      this.form.firstname = this.form.firstname || firstname || '';
      this.form.lastname = this.form.lastname || lastname || '';
      if (!this.form.pseudo) {
        this.form.pseudo = user.displayName.replace(/\s+/g, '').toLowerCase();
      }
    }
  }

  private prefillProfilePrompt() {
    this.profilePrompt = {
      firstname: this.form.firstname || '',
      lastname: this.form.lastname || '',
      pseudo: this.form.pseudo || '',
      phone: this.form.phone || '',
    };
    if (this.profilePrompt.pseudo) {
      this.onProfilePromptPseudoChange(this.profilePrompt.pseudo);
    } else {
      this.profilePromptPseudoStatus = 'idle';
    }
  }

  private async needsProfileCompletion(user: User) {
    const ref = doc(firebaseServices.db, 'users', user.uid);
    const snap = await getDoc(ref);
    return !snap.exists();
  }

  private async ensureSocialUserDocument(user: User, overrides?: { firstname: string; lastname: string; pseudo: string; phone?: string }) {
    const db = firebaseServices.db;
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists() && !overrides) {
      return;
    }
    const firstname = overrides?.firstname ?? (this.form.firstname || '');
    const lastname = overrides?.lastname ?? (this.form.lastname || '');
    const pseudoRaw = overrides?.pseudo ?? (this.form.pseudo || user.displayName || '');
    const pseudoTrimmed = pseudoRaw.trim();
    const normalizedPseudo = pseudoTrimmed.toLowerCase();
    if (pseudoTrimmed) {
      await this.ensureUniquePseudo(db, pseudoTrimmed, user.uid);
    }
    const email = (this.form.email || user.email || '').toLowerCase();
    const existing = snap.data() as Record<string, any> | undefined;
    const profession = this.getResolvedProfession() || this.form.profession;
    const payload = {
      firstname,
      lastname,
      pseudo: pseudoTrimmed,
      pseudoLowercase: normalizedPseudo,
      email,
      profession,
      phone: overrides?.phone || (this.form.phone ? this.buildFullPhoneNumber() : ''),
      city: this.form.city,
      address: this.form.address,
      coverURL: '',
      photoURL: user.photoURL ?? '',
      provider: 'google',
      isActive: existing?.['isActive'] ?? true,
      searchKeywords: this.buildSearchKeywords({
        firstname,
        lastname,
        pseudo: pseudoTrimmed,
      }),
      createdAt: snap.exists() ? this.toMillis(existing?.['createdAt']) ?? Date.now() : Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(ref, payload, { merge: true });
  }

  private toMillis(value: any) {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }

  private syncProfessionSelection(value: string) {
    const match = matchProfessionOption(value);
    if (match) {
      this.selectedProfession = match;
      this.customProfession = '';
      return;
    }
    if (value?.trim()) {
      this.selectedProfession = this.professionOtherValue;
      this.customProfession = value;
      return;
    }
    this.selectedProfession = '';
    this.customProfession = '';
  }

  private getResolvedProfession() {
    return resolveProfessionValue(this.selectedProfession, this.customProfession);
  }
}
