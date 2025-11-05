import { Injectable } from '@angular/core';
import { collection, addDoc, getDocs, query, orderBy, doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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

  create(data: any) {
    const col = collection(this.db, 'services');
    return addDoc(col, {
      ...data,
      createdAt: serverTimestamp(),
    });
  }
}
