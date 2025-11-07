import { Injectable } from '@angular/core';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { firebaseServices } from '../../app.config';
import { ConversationSummary, Message } from '../models/conversation.model';

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private db = firebaseServices.db;
  private conversationsCol = collection(this.db, 'conversations');

  private currentUid(): string | null {
    return firebaseServices.auth.currentUser?.uid ?? null;
  }

  async ensureConversation(targetUid: string): Promise<string | null> {
    const currentUid = this.currentUid();
    if (!currentUid || !targetUid || currentUid === targetUid) {
      return null;
    }

    const existing = await this.findConversationWith(targetUid, currentUid);
    if (existing) {
      return existing.id;
    }

    const ref = await addDoc(this.conversationsCol, {
      participantIds: [currentUid, targetUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      readBy: [currentUid],
      lastMessage: null,
    });

    return ref.id;
  }

  listenInbox(currentUid: string): Observable<ConversationSummary[]> {
    return new Observable(subscriber => {
      const q = query(this.conversationsCol, where('participantIds', 'array-contains', currentUid));
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const conversations = snapshot.docs
            .map(docSnap => this.mapConversation(docSnap.id, docSnap.data()))
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          subscriber.next(conversations);
        },
        error => subscriber.error?.(error),
      );

      return () => unsubscribe();
    });
  }

  listenMessages(conversationId: string): Observable<Message[]> {
    return new Observable(subscriber => {
      const messagesCol = collection(this.db, 'conversations', conversationId, 'messages');
      const q = query(messagesCol, orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const messages = snapshot.docs.map(docSnap => this.mapMessage(docSnap.id, docSnap.data()));
          subscriber.next(messages);
        },
        error => subscriber.error?.(error),
      );

      return () => unsubscribe();
    });
  }

  async sendMessage(conversationId: string, body: string) {
    const currentUid = this.currentUid();
    if (!currentUid) throw new Error('Utilisateur non authentifié');

    const trimmed = body.trim();
    if (!trimmed) return;

    const conversationRef = doc(this.db, 'conversations', conversationId);
    const messagesCol = collection(conversationRef, 'messages');

    await addDoc(messagesCol, {
      body: trimmed,
      senderId: currentUid,
      createdAt: serverTimestamp(),
      readBy: [currentUid],
    });

    await updateDoc(conversationRef, {
      updatedAt: serverTimestamp(),
      lastMessage: {
        body: trimmed,
        senderId: currentUid,
        createdAt: serverTimestamp(),
      },
      readBy: [currentUid],
    });
  }

  async markAsRead(conversationId: string) {
    const currentUid = this.currentUid();
    if (!currentUid) return;

    const conversationRef = doc(this.db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      readBy: arrayUnion(currentUid),
    });
  }

  async getConversation(conversationId: string): Promise<ConversationSummary | null> {
    const ref = doc(this.db, 'conversations', conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return this.mapConversation(snap.id, snap.data());
  }

  async getUserProfile(uid: string) {
    const ref = doc(this.db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: uid, ...snap.data() } as any;
  }

  private async findConversationWith(targetUid: string, currentUid: string) {
    const q = query(this.conversationsCol, where('participantIds', 'array-contains', currentUid));
    const snap = await getDocs(q);
    return snap.docs.find(docSnap => {
      const data = docSnap.data() as any;
      const participants: string[] = data.participantIds ?? [];
      return participants.includes(targetUid);
    });
  }

  private mapConversation(id: string, data: any): ConversationSummary {
    return {
      id,
      participantIds: data.participantIds ?? [],
      updatedAt: this.toMillis(data.updatedAt),
      readBy: data.readBy ?? [],
      lastMessage: data.lastMessage
        ? {
            body: data.lastMessage.body,
            senderId: data.lastMessage.senderId,
            createdAt: this.toMillis(data.lastMessage.createdAt),
          }
        : null,
    };
  }

  private mapMessage(id: string, data: any): Message {
    return {
      id,
      body: data.body,
      senderId: data.senderId,
      createdAt: this.toMillis(data.createdAt),
      readBy: data.readBy ?? [],
    };
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }
}
