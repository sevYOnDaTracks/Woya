import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseServices } from '../../app.config';
import { RequestPost } from '../models/request.model';

@Injectable({ providedIn: 'root' })
export class RequestsService {
  private db = firebaseServices.db;
  private storage = getStorage();
  private collectionRef = collection(this.db, 'requests');

  async create(payload: {
    category: string;
    description: string;
    photos: File[];
    owner: { uid: string; pseudo?: string; city?: string };
  }) {
    const photoUrls = await this.uploadPhotos(payload.owner.uid, payload.photos.slice(0, 3));
    const docRef = await addDoc(this.collectionRef, {
      category: payload.category,
      description: payload.description.trim(),
      photos: photoUrls,
      ownerId: payload.owner.uid,
      ownerPseudo: payload.owner.pseudo || '',
      ownerCity: payload.owner.city || '',
      status: 'active',
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async listLatest(options?: { pageSize?: number; category?: string; cursor?: any }) {
    const pageSize = options?.pageSize ?? 10;
    const filters = [];
    if (options?.category) {
      filters.push(where('category', '==', options.category));
    }
    filters.push(where('status', '==', 'active'));
    const q = query(
      this.collectionRef,
      ...filters,
      orderBy('createdAt', 'desc'),
      limit(pageSize),
      ...(options?.cursor ? [startAfter(options.cursor)] : []),
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(docSnap => this.mapRequest(docSnap.id, docSnap.data() as any));
    const last = snap.docs[snap.docs.length - 1] ?? null;
    return { items, cursor: last };
  }

  async getOwnerDisplay(uid: string) {
    const ref = doc(this.db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { pseudo: 'Utilisateur', city: '' };
    const data: any = snap.data();
    return {
      pseudo: data?.pseudo || data?.firstname || 'Utilisateur',
      city: data?.city || '',
    };
  }

  private mapRequest(id: string, raw: any): RequestPost {
    const createdAt = this.toMillis(raw?.createdAt);
    return {
      id,
      category: raw?.category ?? '',
      description: raw?.description ?? '',
      photos: Array.isArray(raw?.photos) ? raw.photos.slice(0, 3) : [],
      ownerId: raw?.ownerId ?? '',
      ownerPseudo: raw?.ownerPseudo ?? '',
      ownerCity: raw?.ownerCity ?? '',
      createdAt: createdAt ?? Date.now(),
      status: raw?.status ?? 'active',
    };
  }

  private async uploadPhotos(uid: string, files: File[]) {
    if (!files.length) return [];
    const uploads = await Promise.all(
      files.map(async (file, index) => {
        const path = `requests/${uid}/${Date.now()}-${index}-${file.name}`;
        const storageRef = ref(this.storage, path);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
      }),
    );
    return uploads;
  }

  private toMillis(value: any) {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value instanceof Timestamp) return value.toMillis();
    if (value?.seconds) return value.seconds * 1000;
    return undefined;
  }
}

