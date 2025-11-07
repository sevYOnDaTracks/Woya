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
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async listByOwner(ownerId: string): Promise<WoyaService[]> {
    const q = query(this.col, where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  create(data: any) {
    const col = collection(this.db, 'services');
    return addDoc(col, {
      ...data,
      createdAt: serverTimestamp(),
    });
  }

  getById(id: string) {
    const ref = doc(this.db, 'services', id);
    return getDoc(ref);
  }

  update(id: string, data: Partial<WoyaService>) {
    const ref = doc(this.db, 'services', id);
    return updateDoc(ref, data as any);
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
}
