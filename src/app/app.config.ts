import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// ✅ Firebase SDK imports (modern, sans @angular/fire)
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
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
  ]
};

// --- Firebase initialization (à exécuter une fois)
const app = initializeApp(environment.firebase);

// --- Optionnel : Analytics (vérifie la compatibilité navigateur)
isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
    console.log('📊 Firebase Analytics activé');
  }
});

// --- Services Firebase globaux
export const firebaseServices = {
  app,
  auth: getAuth(app),
  db: getFirestore(app),
  storage: getStorage(app),
};
