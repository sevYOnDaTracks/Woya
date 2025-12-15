import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firebaseServices } from '../../app.config';
import { Post, PostVisibility } from '../models/post.model';

interface ListPostsResult {
  posts: Post[];
  cursor: any | null;
}

@Injectable({ providedIn: 'root' })
export class PostsService {
  private db = firebaseServices.db;
  private postsCol = collection(this.db, 'posts');

  async createPost(input: {
    body: string;
    address?: string | null;
    phone?: string | null;
    mediaUrls?: string[];
    category?: string | null;
    serviceTitle?: string | null;
    serviceId?: string | null;
    city?: string | null;
    visibility?: PostVisibility;
  }): Promise<Post> {
    const current = firebaseServices.auth.currentUser;
    if (!current) {
      throw new Error('Utilisateur non connecte');
    }

    const payload = {
      authorId: current.uid,
      body: input.body.trim(),
      address: input.address || null,
      phone: input.phone || null,
      mediaUrls: input.mediaUrls || [],
      category: input.category || null,
      serviceTitle: input.serviceTitle || null,
      serviceId: input.serviceId || null,
      city: input.city || null,
      visibility: input.visibility || 'public',
      status: 'published' as const,
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(this.postsCol, payload);
    return {
      id: ref.id,
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async updatePost(
    postId: string,
    payload: { body?: string; address?: string | null; phone?: string | null },
  ) {
    const current = firebaseServices.auth.currentUser;
    if (!current) throw new Error('Utilisateur non connecte');
    const ref = doc(this.db, 'posts', postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('POST_NOT_FOUND');
    const data = snap.data() as any;
    if (data.authorId !== current.uid) throw new Error('NOT_AUTHORIZED');

    const update: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (payload.body !== undefined) {
      update['body'] = payload.body.trim();
    }
    if (payload.address !== undefined) {
      update['address'] = payload.address?.trim() || null;
    }
    if (payload.phone !== undefined) {
      update['phone'] = payload.phone?.trim() || null;
    }
    await updateDoc(ref, update);
  }

  async uploadImages(files: File[], authorId: string): Promise<string[]> {
    if (!files.length) return [];
    const storage = getStorage();
    const uploads = files.map(async file => {
      const fileId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `posts/${authorId}/${fileId}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
    });
    return Promise.all(uploads);
  }

  async listPosts(limitCount = 10, cursor: any | null = null): Promise<ListPostsResult> {
    const q = cursor
      ? query(this.postsCol, orderBy('createdAt', 'desc'), startAfter(cursor), limit(limitCount))
      : query(this.postsCol, orderBy('createdAt', 'desc'), limit(limitCount));

    const snap = await getDocs(q);
    const posts = snap.docs.map(docSnap => this.mapPost(docSnap.id, docSnap.data()));
    const last = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { posts, cursor: last };
  }

  async toggleLike(postId: string, userId: string, shouldLike: boolean) {
    const likeRef = doc(this.db, 'posts', postId, 'likes', userId);
    const postRef = doc(this.db, 'posts', postId);

    if (shouldLike) {
      await setDoc(likeRef, { createdAt: serverTimestamp() });
      await updateDoc(postRef, { likeCount: increment(1) });
    } else {
      const existing = await getDoc(likeRef);
      if (existing.exists()) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likeCount: increment(-1) });
      }
    }
  }

  async hasUserLiked(postId: string, userId: string) {
    const likeRef = doc(this.db, 'posts', postId, 'likes', userId);
    const snap = await getDoc(likeRef);
    return snap.exists();
  }

  async addComment(postId: string, message: string) {
    const current = firebaseServices.auth.currentUser;
    if (!current) {
      throw new Error('Utilisateur non connecte');
    }
    const commentsCol = collection(this.db, 'posts', postId, 'comments');
    await addDoc(commentsCol, {
      authorId: current.uid,
      body: message.trim(),
      createdAt: serverTimestamp(),
    });
    const postRef = doc(this.db, 'posts', postId);
    await updateDoc(postRef, { commentCount: increment(1) });
  }

  async deletePost(postId: string) {
    const current = firebaseServices.auth.currentUser;
    if (!current) {
      throw new Error('Utilisateur non connecte');
    }
    const ref = doc(this.db, 'posts', postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    if (data.authorId !== current.uid) {
      throw new Error('NOT_AUTHORIZED');
    }
    await deleteDoc(ref);
  }

  private mapPost(id: string, data: any): Post {
    const toMillis = (value: any) => {
      if (!value) return undefined;
      if (typeof value === 'number') return value;
      if (value.seconds) return value.seconds * 1000;
      return undefined;
    };

    return {
      id,
      authorId: data.authorId,
      body: data.body,
      address: data.address,
      phone: data.phone,
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : [],
      category: data.category,
      serviceTitle: data.serviceTitle,
      serviceId: data.serviceId,
      city: data.city,
      visibility: data.visibility,
      status: data.status,
      likeCount: data.likeCount ?? 0,
      commentCount: data.commentCount ?? 0,
      createdAt: toMillis(data.createdAt),
      updatedAt: toMillis(data.updatedAt),
    };
  }
}
