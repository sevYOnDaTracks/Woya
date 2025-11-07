import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthStore {

  user$ = new BehaviorSubject<any>(null);
  private presenceInterval?: any;
  private unloadHandler?: () => void;
  private visibilityHandler?: () => void;
  private currentUserDoc?: ReturnType<typeof doc>;

  constructor() {
    onAuthStateChanged(firebaseServices.auth, async (authUser) => {
      if (!authUser) {
        this.user$.next(null);
        this.currentUserDoc = undefined;
        this.stopPresence();
        return;
      }

      // Charger les données Firestore
      const ref = doc(firebaseServices.db, 'users', authUser.uid);
      const snap = await getDoc(ref);

      this.user$.next({
        uid: authUser.uid,
        ...snap.data()
      });

      this.currentUserDoc = ref;
      this.startPresence();
    });
  }

  logout() {
    return firebaseServices.auth.signOut();
  }

  private startPresence() {
    this.stopPresence();
    if (!this.currentUserDoc) return;

    const updatePresence = async () => {
      try {
        await updateDoc(this.currentUserDoc!, { lastSeen: serverTimestamp() });
      } catch (error) {
        console.warn('Impossible de mettre à jour la présence', error);
      }
    };

    updatePresence();
    this.presenceInterval = setInterval(updatePresence, 60_000);

    if (typeof window !== 'undefined') {
      this.unloadHandler = () => {
        updatePresence();
      };
      window.addEventListener('beforeunload', this.unloadHandler);
    }

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!document.hidden) {
          updatePresence();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private stopPresence() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = undefined;
    }

    if (typeof window !== 'undefined' && this.unloadHandler) {
      window.removeEventListener('beforeunload', this.unloadHandler);
      this.unloadHandler = undefined;
    }
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
  }
}
