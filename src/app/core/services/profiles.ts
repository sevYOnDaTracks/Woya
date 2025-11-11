import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
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

export interface GalleryPhoto {
  id: string;
  url: string;
  caption?: string;
  storagePath?: string;
  createdAt?: number;
}

export interface GalleryAlbum {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  photos: GalleryPhoto[];
  createdAt?: number;
  updatedAt?: number;
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
  private galleryAlbumsCol = collection(this.db, 'userGalleries');
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

  async getGalleries(uid: string): Promise<GalleryAlbum[]> {
    const q = query(this.galleryAlbumsCol, where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapGalleryAlbum(docSnap.id, docSnap.data()))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  async createGallery(ownerId: string, title: string, description: string) {
    const payload = {
      ownerId,
      title: title.trim(),
      description: description.trim(),
      photos: [] as GalleryPhoto[],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(this.galleryAlbumsCol, payload);
    return {
      id: ref.id,
      ownerId,
      title: payload.title,
      description: payload.description,
      photos: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as GalleryAlbum;
  }

  async addGalleryPhoto(ownerId: string, galleryId: string, file: File, caption: string) {
    if (!file) throw new Error('Aucune image sélectionnée');
    const galleryRef = doc(this.db, 'userGalleries', galleryId);
    const snap = await getDoc(galleryRef);
    if (!snap.exists()) throw new Error('Galerie introuvable');
    const data = snap.data() as any;
    if (data.ownerId !== ownerId) {
      throw new Error('Tu ne peux modifier qu\'une galerie qui t\'appartient.');
    }
    const photos: GalleryPhoto[] = Array.isArray(data.photos) ? data.photos : [];
    if (photos.length >= 5) {
      throw new Error('Cette galerie contient déjà 5 photos.');
    }

    const storage = getStorage();
    const photoId =
      typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `users/${ownerId}/galleries/${galleryId}/${photoId}-${file.name}`;
    const storageReference = ref(storage, storagePath);
    await uploadBytes(storageReference, file);
    const url = await getDownloadURL(storageReference);

    const newPhoto: GalleryPhoto = {
      id: photoId,
      url,
      caption: caption.trim(),
      storagePath,
      createdAt: Date.now(),
    };

    const updatedPhotos = [...photos, newPhoto];
    await setDoc(
      galleryRef,
      { photos: updatedPhotos, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return newPhoto;
  }

  async removeGalleryPhoto(ownerId: string, galleryId: string, photoId: string) {
    const galleryRef = doc(this.db, 'userGalleries', galleryId);
    const snap = await getDoc(galleryRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    if (data.ownerId !== ownerId) return;
    const photos: GalleryPhoto[] = Array.isArray(data.photos) ? data.photos : [];
    const target = photos.find(photo => photo.id === photoId);
    const updatedPhotos = photos.filter(photo => photo.id !== photoId);
    await setDoc(
      galleryRef,
      { photos: updatedPhotos, updatedAt: serverTimestamp() },
      { merge: true },
    );

    if (target?.storagePath) {
      const storage = getStorage();
      await deleteObject(ref(storage, target.storagePath)).catch(() => null);
    }
  }

  async deleteGallery(ownerId: string, galleryId: string) {
    const galleryRef = doc(this.db, 'userGalleries', galleryId);
    const snap = await getDoc(galleryRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    if (data.ownerId !== ownerId) return;
    const photos: GalleryPhoto[] = Array.isArray(data.photos) ? data.photos : [];
    const storage = getStorage();
    await Promise.all(
      photos
        .filter(photo => photo.storagePath)
        .map(photo => deleteObject(ref(storage, photo.storagePath!)).catch(() => null)),
    );
    await deleteDoc(galleryRef);
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

  async getProfilesByIds(uids: string[]) {
    const unique = Array.from(new Set(uids.filter(Boolean)));
    if (!unique.length) {
      return {};
    }
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 10) {
      chunks.push(unique.slice(i, i + 10));
    }
    const results: Record<string, any> = {};
    for (const chunk of chunks) {
      const q = query(this.usersCol, where(documentId(), 'in', chunk));
      const snap = await getDocs(q);
      snap.docs.forEach(docSnap => {
        results[docSnap.id] = this.mapProfile(docSnap);
      });
    }
    return results;
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

  private mapGalleryAlbum(id: string, raw: any): GalleryAlbum {
    const photos: any[] = Array.isArray(raw?.photos) ? raw.photos : [];
    return {
      id,
      ownerId: raw?.ownerId,
      title: raw?.title ?? 'Galerie',
      description: raw?.description ?? '',
      photos: photos.map(photo => ({
        id: photo?.id ?? '',
        url: photo?.url ?? '',
        caption: photo?.caption ?? '',
        storagePath: photo?.storagePath,
        createdAt: this.toMillis(photo?.createdAt),
      })),
      createdAt: this.toMillis(raw?.createdAt),
      updatedAt: this.toMillis(raw?.updatedAt),
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

  async isPseudoAvailable(pseudo: string, excludeUid?: string) {
    const normalized = (pseudo || '').trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    const qPseudo = query(this.usersCol, where('pseudoLowercase', '==', normalized), limit(1));
    const snap = await getDocs(qPseudo);
    if (snap.empty) {
      return true;
    }
    const docSnap = snap.docs[0];
    if (excludeUid && docSnap.id === excludeUid) {
      return true;
    }
    return false;
  }
}
