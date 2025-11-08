import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { firebaseServices } from '../../app.config';

export interface FavoriteEntry {
  id: string;
  ownerId: string;
  providerId: string;
  createdAt?: number;
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private db = firebaseServices.db;
  private col = collection(this.db, 'favorites');

  async list(ownerId: string): Promise<FavoriteEntry[]> {
    const q = query(this.col, where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => ({
      id: docSnap.id,
      ownerId: docSnap.data()['ownerId'],
      providerId: docSnap.data()['providerId'],
      createdAt: this.toMillis(docSnap.data()['createdAt']),
    }));
  }

  async ensureFavorite(ownerId: string, providerId: string): Promise<string> {
    const existing = await this.findEntry(ownerId, providerId);
    if (existing) {
      return existing.id;
    }
    const ref = await addDoc(this.col, {
      ownerId,
      providerId,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async removeFavorite(entryId: string) {
    const ref = doc(this.db, 'favorites', entryId);
    await deleteDoc(ref);
  }

  async findEntry(ownerId: string, providerId: string): Promise<FavoriteEntry | null> {
    const q = query(this.col, where('ownerId', '==', ownerId), where('providerId', '==', providerId), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return {
      id: docSnap.id,
      ownerId,
      providerId,
      createdAt: this.toMillis(docSnap.data()['createdAt']),
    };
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }
}
