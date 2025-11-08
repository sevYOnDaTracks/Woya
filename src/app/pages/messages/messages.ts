import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../../shared/shared-imports';
import { MessagingService } from '../../core/services/messaging';
import { AuthStore } from '../../core/store/auth.store';
import { ConversationSummary } from '../../core/models/conversation.model';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';

interface ConversationItem {
  conversation: ConversationSummary;
  otherUser: any | null;
  unread: boolean;
}

@Component({
  selector: 'app-messages-inbox',
  standalone: true,
  imports: [...SharedImports, TimeAgoPipe],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export default class MessagesInbox implements OnInit, OnDestroy {
  loading = true;
  conversations: ConversationItem[] = [];
  currentUid: string | null = null;
  filteredConversations: ConversationItem[] = [];
  visibleConversations: ConversationItem[] = [];
  visibleCount = 5;

  private readonly pageSize = 5;
  private _searchTerm = '';
  get searchTerm() {
    return this._searchTerm;
  }

  goToProfile(item: ConversationItem, event?: Event) {
    event?.stopPropagation();
    const targetId = item.otherUser?.uid || item.otherUser?.id;
    if (!targetId) return;
    this.router.navigate(['/prestataires', targetId]);
  }
  set searchTerm(value: string) {
    if (this._searchTerm === value) return;
    this._searchTerm = value;
    this.updateFiltered();
  }

  private subs: Subscription[] = [];
  private inboxSub?: Subscription;
  private profileCache = new Map<string, any>();

  constructor(
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
  ) {
    this.updateFiltered();
  }

  ngOnInit(): void {
    this.subs.push(
      this.auth.user$.subscribe(user => {
        this.currentUid = user?.uid ?? null;
        if (!this.currentUid) {
          this.teardownInbox();
          this.conversations = [];
          this.updateFiltered();
          this.loading = false;
          return;
        }

        this.bindInbox();
      }),
    );
  }

  ngOnDestroy(): void {
    this.teardownInbox();
    this.subs.forEach(s => s.unsubscribe());
  }

  open(conversation: ConversationSummary) {
    this.router.navigate(['/messagerie', conversation.id]);
  }

  startNew() {
    this.router.navigate(['/services']);
  }

  private bindInbox() {
    if (!this.currentUid) return;

    this.loading = true;
    this.teardownInbox();

    this.inboxSub = this.messaging.listenInbox(this.currentUid).subscribe({
      next: convs => this.hydrate(convs),
      error: err => {
        console.error('Unable to load inbox', err);
        this.loading = false;
      },
    });
  }

  private teardownInbox() {
    this.inboxSub?.unsubscribe();
    this.inboxSub = undefined;
  }

  private async hydrate(conversations: ConversationSummary[]) {
    if (!this.currentUid) return;

    const items = await Promise.all(
      conversations.map(async conversation => {
        const otherId = conversation.participantIds.find(id => id !== this.currentUid) ?? this.currentUid!;
        const otherUser = await this.fetchProfile(otherId);

        const unread = !(conversation.readBy ?? []).includes(this.currentUid!);

        return { conversation, otherUser, unread } as ConversationItem;
      }),
    );

    this.conversations = items.sort((a, b) => (b.conversation.updatedAt ?? 0) - (a.conversation.updatedAt ?? 0));
    this.updateFiltered();
    this.loading = false;
  }

  private async fetchProfile(uid: string) {
    if (this.profileCache.has(uid)) {
      return this.profileCache.get(uid);
    }

    try {
      const data = await this.messaging.getUserProfile(uid);
      if (data && data.lastSeen && (data.lastSeen as any).seconds) {
        data.lastSeen = (data.lastSeen as any).seconds * 1000;
      }
      this.profileCache.set(uid, data);
      return data;
    } catch (error) {
      console.error('Unable to fetch user profile', error);
      this.profileCache.set(uid, null);
      return null;
    }
  }

  displayName(user: any | null | undefined) {
    if (!user) return 'Utilisateur';
    if (user.pseudo && user.pseudo.trim().length > 0) {
      return user.pseudo;
    }
    const firstname = user.firstname || 'Utilisateur';
    const lastname = user.lastname ? ` ${user.lastname}` : '';
    return `${firstname}${lastname}`;
  }

  onScroll(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const threshold = 24;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - threshold) {
      this.loadMore();
    }
  }

  private loadMore() {
    if (this.visibleCount >= this.filteredConversations.length) return;
    this.visibleCount = Math.min(this.visibleCount + this.pageSize, this.filteredConversations.length);
    this.visibleConversations = this.filteredConversations.slice(0, this.visibleCount);
  }

  private updateFiltered() {
    this.filteredConversations = this.filterConversations();
    this.visibleCount = Math.min(this.pageSize, this.filteredConversations.length);
    this.visibleConversations = this.filteredConversations.slice(0, this.visibleCount);
  }

  private filterConversations() {
    const term = this._searchTerm.trim().toLowerCase();
    if (!term) return [...this.conversations];
    return this.conversations.filter(item => {
      const haystack = [
        this.displayName(item.otherUser),
        item.otherUser?.firstname || '',
        item.otherUser?.lastname || '',
        item.otherUser?.pseudo || '',
        item.otherUser?.profession || '',
        item.conversation.lastMessage?.body || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }
}
