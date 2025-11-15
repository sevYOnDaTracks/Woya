import { Injectable } from '@angular/core';
import { firebaseServices } from '../../app.config';
import { onAuthStateChanged, User } from 'firebase/auth';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, DocumentSnapshot } from 'firebase/firestore';

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
  private profileUnsub?: () => void;
  private readonly reloadMarkerKey = 'woyaReloadedUid';
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
      this.unsubscribeProfile();
      this.clearReloadMarker();
      this.markInitialAuthDone();
      return;
    }

    const fallback = this.buildAuthSnapshot(authUser);
    this.user$.next(fallback);

    const ref = doc(firebaseServices.db, 'users', authUser.uid);
    this.currentUserDoc = ref;

    this.profileUnsub?.();
    this.profileUnsub = onSnapshot(
      ref,
      snapshot => {
        if (token !== this.hydrationToken) {
          return;
        }
        void this.processProfileSnapshot(ref, snapshot, fallback, token);
      },
      error => {
        console.warn('Impossible de charger le profil Firestore', error);
        if (token === this.hydrationToken) {
          this.user$.next({ ...fallback, profileLoading: false });
          this.markInitialAuthDone();
        }
      },
    );

    if (token === this.hydrationToken) {
      this.startPresence();
    }
  }

  waitForInitialAuth(): Promise<void> {
    return this.initialAuthResolved ? Promise.resolve() : this.initialAuthPromise;
  }

  async waitForProfileReady() {
    const current = this.user$.value;
    if (!current || !current.profileLoading) {
      return current;
    }
    return firstValueFrom(
      this.user$.pipe(filter(user => !user || !user.profileLoading)),
    );
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

  private unsubscribeProfile() {
    if (this.profileUnsub) {
      this.profileUnsub();
      this.profileUnsub = undefined;
    }
  }

  private triggerInitialReload(user: AuthUserState | null) {
    if (!user?.uid) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const storage = this.getSessionStorage();
    if (storage) {
      const alreadyReloadedUid = storage.getItem(this.reloadMarkerKey);
      if (alreadyReloadedUid === user.uid) {
        return;
      }
      try {
        storage.setItem(this.reloadMarkerKey, user.uid);
      } catch {
        /* ignore */
      }
    }
    window.location.reload();
  }

  private clearReloadMarker() {
    const storage = this.getSessionStorage();
    if (!storage) return;
    try {
      storage.removeItem(this.reloadMarkerKey);
    } catch {
      /* ignore */
    }
  }

  private getSessionStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  private async processProfileSnapshot(
    ref: ReturnType<typeof doc>,
    snapshot: DocumentSnapshot,
    fallback: AuthUserState,
    token: number,
  ) {
    if (token !== this.hydrationToken) return;
    let profile = snapshot.exists() ? snapshot.data() ?? {} : {};
    const fallbackPayload: Record<string, any> = {};
    const storedEmail = profile['email'] as string | null | undefined;
    const fallbackEmail = fallback.email?.trim();
    if (!storedEmail && fallbackEmail) {
      fallbackPayload['email'] = fallbackEmail;
      fallbackPayload['emailLowercase'] = fallbackEmail.toLowerCase();
    }
    const storedPhoto = profile['photoURL'] as string | null | undefined;
    const fallbackPhoto = fallback.photoURL?.trim();
    if (!storedPhoto && fallbackPhoto) {
      fallbackPayload['photoURL'] = fallbackPhoto;
    }
    if (Object.keys(fallbackPayload).length) {
      try {
        fallbackPayload['updatedAt'] = Date.now();
        await setDoc(ref, fallbackPayload, { merge: true });
        profile = {
          ...profile,
          ...fallbackPayload,
        };
      } catch (error) {
        console.warn('Impossible de synchroniser le profil utilisateur', error);
      }
    }
    if (token !== this.hydrationToken) return;
    const hydrated = this.mergeProfileSnapshot(fallback, profile);
    this.user$.next(hydrated);
    this.markInitialAuthDone();
    this.triggerInitialReload(hydrated);
  }
}
