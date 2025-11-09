import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebaseServices } from '../../app.config';
import { Services } from './services';
import { WoyaService } from '../models/service.model';

export interface AdminUserRecord {
  id: string;
  firstname?: string;
  lastname?: string;
  pseudo?: string;
  email?: string;
  phone?: string;
  city?: string;
  profession?: string;
  role?: string;
  photoURL?: string;
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface GalleryItem {
  id: string;
  ownerId: string;
  url: string;
  caption?: string;
  storagePath?: string;
  createdAt?: number;
}

export interface ReviewReply {
  id: string;
  reviewId: string;
  authorId: string;
  message: string;
  createdAt?: number;
  author?: {
    pseudo?: string;
    firstname?: string;
    lastname?: string;
    photoURL?: string;
  };
}

export interface UserReview {
  id: string;
  targetId: string;
  reviewerId: string;
  rating: number;
  comment: string;
  createdAt?: number;
  updatedAt?: number;
  reviewer?: {
    pseudo?: string;
    firstname?: string;
    lastname?: string;
    photoURL?: string;
  };
  replies?: ReviewReply[];
}

@Injectable({ providedIn: 'root' })
export class ProfilesService {
  private db = firebaseServices.db;
  private galleryCol = collection(this.db, 'userGallery');
  private reviewsCol = collection(this.db, 'reviews');
  private usersCol = collection(this.db, 'users');

  constructor(private servicesApi: Services) {}

  async getPublicProfile(uid: string) {
    const ref = doc(this.db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data: any = snap.data() ?? {};
    if (data.lastSeen?.seconds) {
      data.lastSeen = data.lastSeen.seconds * 1000;
    }
    if (data.createdAt?.seconds) {
      data.createdAt = data.createdAt.seconds * 1000;
    }
    return { id: uid, uid, ...data };
  }

  getUserServices(uid: string): Promise<WoyaService[]> {
    return this.servicesApi.listByOwner(uid);
  }

  async getGallery(uid: string): Promise<GalleryItem[]> {
    const q = query(this.galleryCol, where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          ownerId: data.ownerId,
          url: data.url,
          caption: data.caption,
          storagePath: data.storagePath,
          createdAt: this.toMillis(data.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async addGalleryItem(uid: string, file: File, caption: string) {
    if (!file) return null;
    const storage = getStorage();
    const path = `users/${uid}/gallery/${Date.now()}-${file.name}`;
    const storageReference = ref(storage, path);
    await uploadBytes(storageReference, file);
    const url = await getDownloadURL(storageReference);
    const docRef = await addDoc(this.galleryCol, {
      ownerId: uid,
      url,
      caption,
      storagePath: path,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async removeGalleryItem(ownerId: string, item: GalleryItem & { storagePath?: string }) {
    if (!item?.id) return;
    const docRef = doc(this.db, 'userGallery', item.id);
    await deleteDoc(docRef);
    const storagePath = (item as any).storagePath;
    if (storagePath) {
      try {
        const storage = getStorage();
        await deleteObject(ref(storage, storagePath));
      } catch {
        // ignore errors on delete
      }
    }
  }

  async listAllUsers(): Promise<AdminUserRecord[]> {
    const snap = await getDocs(this.usersCol);
    return snap.docs.map(docSnap => this.mapUserRecord(docSnap.id, docSnap.data()));
  }

  async deleteUser(uid: string) {
    if (!uid) return;
    const ref = doc(this.db, 'users', uid);
    await deleteDoc(ref);
  }

  async updateUser(uid: string, payload: Partial<AdminUserRecord>) {
    if (!uid) return;
    const ref = doc(this.db, 'users', uid);
    const sanitized: Record<string, any> = {};
    const keys: (keyof AdminUserRecord)[] = [
      'firstname',
      'lastname',
      'pseudo',
      'email',
      'phone',
      'city',
      'profession',
      'role',
      'photoURL',
      'isActive',
    ];
    keys.forEach(key => {
      if (payload[key] !== undefined) {
        const value = payload[key];
        sanitized[key] = typeof value === 'string' ? value.trim() : value;
      }
    });
    sanitized['updatedAt'] = Date.now();
    await setDoc(ref, sanitized, { merge: true });
  }

  async saveCover(uid: string, file: File) {
    const storage = getStorage();
    const coverRef = ref(storage, `users/${uid}/cover.jpg`);
    await uploadBytes(coverRef, file);
    const coverURL = await getDownloadURL(coverRef);
    const userRef = doc(this.db, 'users', uid);
    await setDoc(userRef, { coverURL, updatedAt: Date.now() }, { merge: true });
    return coverURL;
  }

  async getReviews(targetId: string): Promise<UserReview[]> {
    const q = query(this.reviewsCol, where('targetId', '==', targetId));
    const snap = await getDocs(q);
    const reviews = snap.docs.map(docSnap => this.mapReview(docSnap.id, docSnap.data()));
    reviews.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return Promise.all(
      reviews.map(async review => ({
        ...review,
        replies: await this.getReviewReplies(review.id),
      })),
    );
  }

  async getUserReview(targetId: string, reviewerId: string): Promise<UserReview | null> {
    const docId = `${targetId}_${reviewerId}`;
    const ref = doc(this.db, 'reviews', docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return this.mapReview(snap.id, snap.data());
  }

  async saveReview(targetId: string, rating: number, comment: string) {
  const reviewer = firebaseServices.auth.currentUser;
  if (!reviewer) throw new Error('Utilisateur non connecté');
  if (!rating || rating < 1 || rating > 5) throw new Error('Note invalide');

  const reviewerProfile = await this.getPublicProfile(reviewer.uid);

  const payload = {
    targetId,
    reviewerId: reviewer.uid,
    rating,
    comment: comment.trim(),
    reviewer: {
      pseudo: reviewerProfile?.pseudo ?? reviewerProfile?.firstname,
      firstname: reviewerProfile?.firstname,
      lastname: reviewerProfile?.lastname,
      photoURL: reviewerProfile?.photoURL,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // ✅ CHANGEMENT ICI : nouvel avis = nouveau document
  await addDoc(this.reviewsCol, payload);
}


  async addReviewReply(reviewId: string, message: string) {
    const current = firebaseServices.auth.currentUser;
    if (!current) throw new Error('Utilisateur non connecté');
    const profile = await this.getPublicProfile(current.uid);
    const repliesCol = collection(this.db, 'reviews', reviewId, 'replies');
    await addDoc(repliesCol, {
      reviewId,
      authorId: current.uid,
      message: message.trim(),
      author: {
        pseudo: (profile?.pseudo ?? profile?.firstname ?? '').toString(),
        firstname: (profile?.firstname ?? '').toString(),
        lastname: (profile?.lastname ?? '').toString(),
        photoURL: profile?.photoURL ?? '',
      },
      createdAt: serverTimestamp(),
    });
  }

  private async getReviewReplies(reviewId: string): Promise<ReviewReply[]> {
    const repliesCol = collection(this.db, 'reviews', reviewId, 'replies');
    const q = query(repliesCol, orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        reviewId,
        authorId: data.authorId,
        message: data.message,
        author: data.author,
        createdAt: this.toMillis(data.createdAt),
      } as ReviewReply;
    });
  }

  async searchProfiles(term: string) {
    const queryValue = term.trim();
    if (!queryValue || queryValue.length < 2) {
      return [];
    }
    const normalized = queryValue.toLowerCase();
    const q = query(
      collection(this.db, 'users'),
      where('searchKeywords', 'array-contains', normalized),
      limit(20),
    );
    const snap = await getDocs(q);
    let results = snap.docs.map(docSnap => this.mapProfile(docSnap));
    results = results.filter(profile => this.matchesProfileTerm(profile, normalized));

    if (!results.length) {
      const fallback = await getDocs(query(collection(this.db, 'users'), limit(40)));
      results = fallback.docs
        .map(docSnap => this.mapProfile(docSnap))
        .filter(profile => this.matchesProfileTerm(profile, normalized));
    }

    return results.slice(0, 20);
  }

  private mapProfile(docSnap: any) {
    const data = docSnap.data() as any;
    if (data.lastSeen?.seconds) {
      data.lastSeen = data.lastSeen.seconds * 1000;
    }
    return { id: docSnap.id, ...data };
  }

  private matchesProfileTerm(profile: any, term: string) {
    const haystack = [
      profile?.pseudo,
      profile?.firstname,
      profile?.lastname,
      profile?.profession,
      profile?.city,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }

  private mapReview(id: string, data: any): UserReview {
    return {
      id,
      targetId: data.targetId,
      reviewerId: data.reviewerId,
      rating: data.rating,
      comment: data.comment,
      createdAt: this.toMillis(data.createdAt),
      updatedAt: this.toMillis(data.updatedAt),
      reviewer: data.reviewer,
    };
  }

  private mapUserRecord(id: string, raw: any): AdminUserRecord {
    return {
      id,
      firstname: raw?.firstname,
      lastname: raw?.lastname,
      pseudo: raw?.pseudo,
      email: raw?.email,
      phone: raw?.phone,
      city: raw?.city,
      profession: raw?.profession,
      role: raw?.role,
      photoURL: raw?.photoURL,
      isActive: raw?.isActive !== false,
      createdAt: this.toMillis(raw?.createdAt),
      updatedAt: this.toMillis(raw?.updatedAt),
    };
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }
}
