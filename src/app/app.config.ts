import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

// ✅ Firebase SDK imports (modern, sans @angular/fire)
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// --- Angular global providers
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
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
