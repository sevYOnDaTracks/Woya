import { Injectable } from '@angular/core';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { firebaseServices } from '../../app.config';
import { Category } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private db = firebaseServices.db;
  private col = collection(this.db, 'categories');

  async listAll(): Promise<Category[]> {
    const snap = await getDocs(this.col);
    return snap.docs.map(docSnap => this.mapCategory(docSnap));
  }

  async create(payload: { name: string; description?: string; serviceTitles?: string[] }) {
    return addDoc(this.col, {
      name: payload.name.trim(),
      description: payload.description?.trim() || '',
      isActive: true,
      serviceTitles: payload.serviceTitles ?? [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async update(id: string, payload: Partial<Category>) {
    const ref = doc(this.db, 'categories', id);
    await updateDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string) {
    const ref = doc(this.db, 'categories', id);
    await deleteDoc(ref);
  }

  private mapCategory(docSnap: QueryDocumentSnapshot<DocumentData>): Category {
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      name: data.name,
      description: data.description,
      isActive: data.isActive !== false,
      serviceTitles: Array.isArray(data.serviceTitles) ? data.serviceTitles : [],
      createdAt: this.toMillis(data.createdAt),
      updatedAt: this.toMillis(data.updatedAt),
    };
  }

  private toMillis(value: any) {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }
}
