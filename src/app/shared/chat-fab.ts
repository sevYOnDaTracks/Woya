import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConversationSummary } from '../core/models/conversation.model';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';

interface ToastState {
  fromName: string;
  preview: string;
  conversationId: string | null;
}

@Component({
  selector: 'app-chat-fab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-fab.html',
  styleUrl: './chat-fab.css',
})
export class ChatFab implements OnInit, OnDestroy {
  isAuthenticated = false;
  unreadCount = 0;

  showToast = false;
  toast: ToastState = {
    fromName: '',
    preview: '',
    conversationId: null,
  };

  private currentUid: string | null = null;
  private subs: Subscription[] = [];
  private inboxSub?: Subscription;
  private seenMessages = new Map<string, number>();
  private initialSnapshot = true;
  private toastTimeout?: ReturnType<typeof setTimeout>;
  private profileCache = new Map<string, any>();

  constructor(
    private auth: AuthStore,
    private messaging: MessagingService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.auth.user$.subscribe(user => {
        this.isAuthenticated = !!user;
        this.currentUid = user?.uid ?? null;

        if (!this.currentUid) {
          this.teardownInbox();
          this.unreadCount = 0;
          this.hideToast();
          return;
        }

        this.bindInbox();
      }),
    );
  }

  ngOnDestroy(): void {
    this.teardownInbox();
    this.subs.forEach(sub => sub.unsubscribe());
    this.hideToast();
  }

  openInbox() {
    if (!this.isAuthenticated) return;
    this.hideToast();
    this.router.navigate(['/messagerie']);
  }

  openConversation(conversationId: string | null) {
    if (!conversationId) {
      this.openInbox();
      return;
    }
    this.hideToast();
    this.router.navigate(['/messagerie', conversationId]);
  }

  dismissToast(event?: Event) {
    event?.stopPropagation();
    this.hideToast();
  }

  private bindInbox() {
    if (!this.currentUid) return;
    this.teardownInbox();
    this.initialSnapshot = true;
    this.inboxSub = this.messaging.listenInbox(this.currentUid).subscribe({
      next: conversations => this.processInbox(conversations),
      error: err => console.error('Chat FAB inbox error', err),
    });
  }

  private processInbox(conversations: ConversationSummary[]) {
    if (!this.currentUid) return;

    const unread = conversations.reduce((count, conversation) => {
      const isUnread =
        !(conversation.readBy ?? []).includes(this.currentUid!) &&
        conversation.lastMessage?.senderId !== this.currentUid;
      return count + (isUnread ? 1 : 0);
    }, 0);

    if (this.initialSnapshot) {
      this.captureSeen(conversations);
      this.initialSnapshot = false;
    } else {
      this.detectNewMessages(conversations);
      this.captureSeen(conversations);
    }

    this.unreadCount = unread;
  }

  private captureSeen(conversations: ConversationSummary[]) {
    conversations.forEach(conversation => {
      const stamp = conversation.lastMessage?.createdAt ?? conversation.updatedAt ?? 0;
      if (stamp) {
        this.seenMessages.set(conversation.id, stamp);
      }
    });
  }

  private detectNewMessages(conversations: ConversationSummary[]) {
    conversations.forEach(conversation => {
      if (!conversation.lastMessage || !this.currentUid) return;
      if (conversation.lastMessage.senderId === this.currentUid) return;

      const stamp = conversation.lastMessage.createdAt ?? conversation.updatedAt ?? Date.now();
      const previous = this.seenMessages.get(conversation.id) ?? 0;
      if (stamp > previous) {
        this.triggerToast(conversation);
      }
    });
  }

  private async triggerToast(conversation: ConversationSummary) {
    if (!conversation.lastMessage) return;

    const otherId = conversation.participantIds.find(id => id !== this.currentUid) ?? null;
    const profile = otherId ? await this.fetchProfile(otherId) : null;

    const name =
      profile?.pseudo ||
      [profile?.firstname, profile?.lastname].filter(Boolean).join(' ').trim() ||
      'Nouveau message';

    const body = conversation.lastMessage.body ?? '';
    const preview = body.length > 90 ? `${body.slice(0, 90)}…` : body || 'Nouveau message reçu';

    this.toast = {
      fromName: name,
      preview,
      conversationId: conversation.id,
    };

    this.showToast = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => (this.showToast = false), 6000);
  }

  private async fetchProfile(uid: string) {
    if (this.profileCache.has(uid)) {
      return this.profileCache.get(uid);
    }
    try {
      const profile = await this.messaging.getUserProfile(uid);
      this.profileCache.set(uid, profile);
      return profile;
    } catch (error) {
      console.warn('Chat FAB unable to fetch profile', error);
      this.profileCache.set(uid, null);
      return null;
    }
  }

  private hideToast() {
    this.showToast = false;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = undefined;
    }
  }

  private teardownInbox() {
    this.inboxSub?.unsubscribe();
    this.inboxSub = undefined;
    this.seenMessages.clear();
    this.initialSnapshot = true;
  }
}
