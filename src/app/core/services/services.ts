import { Injectable } from '@angular/core';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
  GeoPoint,
  QueryDocumentSnapshot,
  DocumentData,
  limit,
  startAt,
  endAt,
} from 'firebase/firestore';
import { deleteObject, getStorage, ref as storageRef } from 'firebase/storage';
import { firebaseServices } from '../../app.config';
import { WoyaService } from '../models/service.model';

@Injectable({
  providedIn: 'root',
})
export class Services {
  private db = firebaseServices.db;
  private col = collection(this.db, 'services');

  async list(): Promise<WoyaService[]> {
    const q = query(this.col, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => this.mapService(docSnap));
  }

  async listByOwner(ownerId: string): Promise<WoyaService[]> {
    const q = query(this.col, where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapService(docSnap))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  create(data: any) {
    const col = collection(this.db, 'services');
    const payload = this.toFirestorePayload(data);
    return addDoc(col, {
      ...payload,
      createdAt: serverTimestamp(),
    });
  }

  getById(id: string) {
    const ref = doc(this.db, 'services', id);
    return getDoc(ref);
  }

  update(id: string, data: Partial<WoyaService>) {
    const ref = doc(this.db, 'services', id);
    const payload = this.toFirestorePayload(data);
    return updateDoc(ref, payload as any);
  }

  async remove(id: string) {
    const docRef = doc(this.db, 'services', id);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? (snap.data() as WoyaService) : null;

    await deleteDoc(docRef);
    if (!data) return;

    const storage = getStorage();
    const images = [
      data.coverUrl,
      ...(data.extraImages ?? []),
    ].filter((url): url is string => !!url);

    await Promise.allSettled(
      images.map(url => {
        try {
          const fileRef = storageRef(storage, url);
          return deleteObject(fileRef);
        } catch {
          return Promise.resolve();
        }
      }),
    );
  }

  private mapService(docSnap: QueryDocumentSnapshot<DocumentData>): WoyaService {
    const data = docSnap.data() as any;
    const location = data.location && data.location.latitude !== undefined
      ? { lat: data.location.latitude, lng: data.location.longitude }
      : data.location ?? null;

    return {
      id: docSnap.id,
      ...data,
      location,
      isActive: data.isActive !== false,
    } as WoyaService;
  }

  private toFirestorePayload(data: Partial<WoyaService>) {
    const payload: any = { ...data };
    if (payload.location && typeof payload.location.lat === 'number' && typeof payload.location.lng === 'number') {
      payload.location = new GeoPoint(payload.location.lat, payload.location.lng);
    } else if (payload.location === null || payload.location === undefined) {
      delete payload.location;
    }

    if (payload.coverageKm === null || payload.coverageKm === undefined) {
      delete payload.coverageKm;
    }
    if (!payload.availability) {
      delete payload.availability;
    }

    return payload;
  }

  async searchServices(term: string, maxResults = 10): Promise<WoyaService[]> {
    const queryTerm = term.trim();
    if (!queryTerm) return [];
    const normalized = queryTerm.toLowerCase();
    const fetchLimit = Math.max(20, maxResults * 5);
    const q = query(this.col, orderBy('createdAt', 'desc'), limit(fetchLimit));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapService(docSnap))
      .filter(service => service.isActive !== false)
      .filter(service => this.matchesSearchTerm(service, normalized))
      .slice(0, maxResults);
  }

  private matchesSearchTerm(service: WoyaService, term: string) {
    const haystack = [service.title, service.description, service.category, service.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }
}
