import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  updateProfile,
  signOut
} from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {

  register(email: string, password: string, name: string) {
    return createUserWithEmailAndPassword(firebaseServices.auth, email, password)
      .then(async (cred) => {
        await updateProfile(cred.user, { displayName: name });
      });
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(firebaseServices.auth, email, password);
  }

  googleLogin() {
    return signInWithPopup(firebaseServices.auth, new GoogleAuthProvider());
  }

  facebookLogin() {
    return signInWithPopup(firebaseServices.auth, new FacebookAuthProvider());
  }

  logout() {
    return signOut(firebaseServices.auth);
  }

  get user() {
    return firebaseServices.auth.currentUser;
  }
}
