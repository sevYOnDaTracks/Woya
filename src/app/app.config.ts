import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// Firebase SDK imports (modern, without @angular/fire)
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// --- Angular global providers
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    importProvidersFrom(FormsModule),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ],
};

// --- Firebase initialization (execute once)
const app = initializeApp(environment.firebase);
const auth = getAuth(app);

// Force local persistence to avoid periodic disconnects.
void setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('Impossible de fixer la persistance auth', error);
});

// --- Optional: Analytics (checks browser support)
isSupported().then(supported => {
  if (supported) {
    getAnalytics(app);
    console.log('Firebase Analytics active');
  }
});

// --- Global Firebase services
export const firebaseServices = {
  app,
  auth,
  db: getFirestore(app),
  storage: getStorage(app),
};
