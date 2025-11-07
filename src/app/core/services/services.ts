import { Injectable } from '@angular/core';
import { collection, addDoc, getDocs, query, orderBy, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
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

  remove(id: string) {
    const ref = doc(this.db, 'services', id);
    return deleteDoc(ref);
  }
}
