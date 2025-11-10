import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

export interface AuthUserState {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  pseudo?: string | null;
  phone?: string | null;
  phoneNumber?: string;
  photoURL?: string | null;
  coverURL?: string | null;
  profileLoading: boolean;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  user$ = new BehaviorSubject<AuthUserState | null>(null);
  private presenceInterval?: any;
  private unloadHandler?: () => void;
  private visibilityHandler?: () => void;
  private currentUserDoc?: ReturnType<typeof doc>;
  private hydrationToken = 0;
  private initialAuthResolved = false;
  private initialAuthPromise: Promise<void>;
  private resolveInitialAuth?: () => void;

  constructor() {
    this.initialAuthPromise = new Promise(resolve => {
      this.resolveInitialAuth = resolve;
    });

    onAuthStateChanged(firebaseServices.auth, authUser => {
      this.handleAuthChange(authUser).catch(error => {
        console.error('Impossible de mettre a jour le store auth', error);
      });
    });
  }

  logout() {
    return firebaseServices.auth.signOut();
  }

  private async handleAuthChange(authUser: User | null) {
    this.hydrationToken += 1;
    const token = this.hydrationToken;

    if (!authUser) {
      this.user$.next(null);
      this.currentUserDoc = undefined;
      this.stopPresence();
      this.markInitialAuthDone();
      return;
    }

    const fallback = this.buildAuthSnapshot(authUser);
    this.user$.next(fallback);
    this.markInitialAuthDone();

    const ref = doc(firebaseServices.db, 'users', authUser.uid);
    this.currentUserDoc = ref;

    try {
      const snap = await getDoc(ref);
      if (token !== this.hydrationToken) {
        return;
      }
      const profile = snap.exists() ? snap.data() ?? {} : {};
      const hydrated = this.mergeProfileSnapshot(fallback, profile);
      this.user$.next(hydrated);
    } catch (error) {
      console.warn('Impossible de charger le profil Firestore', error);
      if (token === this.hydrationToken) {
        this.user$.next({ ...fallback, profileLoading: false });
        this.markInitialAuthDone();
      }
    }

    if (token === this.hydrationToken) {
      this.startPresence();
    }
  }

  waitForInitialAuth(): Promise<void> {
    return this.initialAuthResolved ? Promise.resolve() : this.initialAuthPromise;
  }

  isInitialAuthResolved() {
    return this.initialAuthResolved;
  }

  private markInitialAuthDone() {
    if (this.initialAuthResolved) {
      return;
    }
    this.initialAuthResolved = true;
    this.resolveInitialAuth?.();
  }

  private buildAuthSnapshot(user: User): AuthUserState {
    return {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      profileLoading: true,
    };
  }

  private mergeProfileSnapshot(fallback: AuthUserState, profile: Record<string, any>): AuthUserState {
    return {
      ...fallback,
      ...profile,
      photoURL: profile?.['photoURL'] ?? fallback.photoURL ?? null,
      coverURL: profile?.['coverURL'] ?? fallback.coverURL ?? null,
      profileLoading: false,
    };
  }

  private startPresence() {
    this.stopPresence();
    if (!this.currentUserDoc) return;

    const updatePresence = async () => {
      try {
        await updateDoc(this.currentUserDoc!, { lastSeen: serverTimestamp() });
      } catch (error) {
        console.warn('Impossible de mettre a jour la presence', error);
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
