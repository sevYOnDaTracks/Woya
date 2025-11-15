import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  return signInWithPopup(firebaseServices.auth, new GoogleAuthProvider())
    .then(async (cred) => {

      const userRef = doc(firebaseServices.db, "users", cred.user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        // Première connexion → on crée un user "propre"
        const fullName = cred.user.displayName || "";
        const firstname = fullName.split(" ")[0] ?? "";
        const pseudo = fullName || firstname || `woya-${cred.user.uid.slice(0, 6)}`;

        await setDoc(userRef, {
          uid: cred.user.uid,
          firstname,
          pseudo,
          email: cred.user.email,
          photoURL: '',
          provider: "google",
          createdAt: new Date()
        });
      }
    });
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
