import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthStore {

  user$ = new BehaviorSubject<any>(null);

  constructor() {
    onAuthStateChanged(firebaseServices.auth, async (authUser) => {
      if (!authUser) {
        this.user$.next(null);
        return;
      }

      // Charger les données Firestore
      const ref = doc(firebaseServices.db, 'users', authUser.uid);
      const snap = await getDoc(ref);

      this.user$.next({
        uid: authUser.uid,
        ...snap.data()
      });
    });
  }

  logout() {
    return firebaseServices.auth.signOut();
  }
}
