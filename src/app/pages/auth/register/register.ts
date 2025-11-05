import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firebaseServices } from '../../../app.config';
import { createUserWithEmailAndPassword, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html'
})
export default class Register {

  form = {
    firstname: '',
    lastname: '',
    email: '',
    password: '',
    countryCode: '+225',
    phone: '',
    birthdate: '',
  };

  preview: string | null = null;
  file: File | null = null;
  loading = false;
  error = '';

  constructor(private router: Router) {}

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

      const cred = await createUserWithEmailAndPassword(auth, this.form.email, this.form.password);

      let photoURL = '';
      if (this.file) {
        const refImg = ref(storage, `users/${cred.user.uid}/profile.jpg`);
        await uploadBytes(refImg, this.file);
        photoURL = await getDownloadURL(refImg);
      }

      await setDoc(doc(db, 'users', cred.user.uid), {
        ...this.form,
        phone: `${this.form.countryCode}${this.form.phone}`,
        photoURL,
        createdAt: Date.now()
      });

      this.router.navigate(['/services']);

    } catch (err) {
      this.error = "Impossible de créer le compte.";
    }

    this.loading = false;
  }

  loginWithGoogle() {
    signInWithPopup(firebaseServices.auth, new GoogleAuthProvider());
  }

  loginWithFacebook() {
    signInWithPopup(firebaseServices.auth, new FacebookAuthProvider());
  }
}
