import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../../shared/shared-imports';
import { MessagingService } from '../../core/services/messaging';
import { AuthStore } from '../../core/store/auth.store';
import { ConversationSummary } from '../../core/models/conversation.model';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { ProfilesService } from '../../core/services/profiles';
import NotificationsPage from './notifications';

interface ConversationItem {
  conversation: ConversationSummary;
  otherUser: any | null;
  unread: boolean;
}

interface SwipeTracker {
  startX: number;
  startY: number;
  pointerId: number;
  dragging: boolean;
}

@Component({
  selector: 'app-messages-inbox',
  standalone: true,
  imports: [...SharedImports, TimeAgoPipe, NotificationsPage],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export default class MessagesInbox implements OnInit, OnDestroy {
  loading = true;
  conversations: ConversationItem[] = [];
  activeFilter: 'all' | 'unread' | 'archived' = 'all';
  activeTab: 'conversations' | 'notifications' = 'conversations';
  currentUid: string | null = null;
  filteredConversations: ConversationItem[] = [];
  visibleConversations: ConversationItem[] = [];
  visibleCount = 5;
  newContactTerm = '';
  newContactResults: any[] = [];
  newContactLoading = false;
  private newContactDebounce?: ReturnType<typeof setTimeout>;

  private readonly pageSize = 5;
  notificationsCount = 0;
  swipeOffsets: Record<string, number> = {};
  private swipeTrackers = new Map<string, SwipeTracker>();
  private swipePreventClick = new Set<string>();
  private readonly swipeTriggerDistance = 90;
  private readonly swipeMaxDistance = 140;
  private readonly swipeActivationDelta = 8;

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

  setFilter(filter: 'all' | 'unread' | 'archived') {
    if (this.activeFilter === filter) return;
    this.activeFilter = filter;
    this.updateFiltered();
  }

  isPinned(item: ConversationItem) {
    if (!this.currentUid) return false;
    return (item.conversation.pinnedBy ?? []).includes(this.currentUid);
  }

  isArchived(item: ConversationItem) {
    if (!this.currentUid) return false;
    return (item.conversation.archivedBy ?? []).includes(this.currentUid);
  }

  onConversationClick(item: ConversationItem) {
    if (this.swipePreventClick.has(item.conversation.id)) {
      return;
    }
    this.open(item.conversation);
  }

  async toggleArchiveConversation(item: ConversationItem, event?: Event) {
    event?.stopPropagation();
    this.resetSwipe(item.conversation.id);
    const shouldArchive = !this.isArchived(item);
    try {
      await this.messaging.setArchiveState(item.conversation.id, shouldArchive);
    } catch (error) {
      console.error('Unable to toggle archive state', error);
    }
  }

  async togglePinConversation(item: ConversationItem, event?: Event) {
    event?.stopPropagation();
    this.resetSwipe(item.conversation.id);
    const shouldPin = !this.isPinned(item);
    try {
      await this.messaging.setPinState(item.conversation.id, shouldPin);
    } catch (error) {
      console.error('Unable to toggle pin state', error);
    }
  }

  onSwipeStart(event: PointerEvent, conversationId: string) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);
    this.swipeTrackers.set(conversationId, {
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      dragging: false,
    });
  }

  onSwipeMove(event: PointerEvent, conversationId: string) {
    const tracker = this.swipeTrackers.get(conversationId);
    if (!tracker) return;

    const deltaX = event.clientX - tracker.startX;
    const deltaY = event.clientY - tracker.startY;

    if (!tracker.dragging) {
      if (Math.abs(deltaX) < this.swipeActivationDelta) {
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        this.resetSwipe(conversationId, event.currentTarget as HTMLElement | null);
        return;
      }
      tracker.dragging = true;
    }

    event.preventDefault();
    this.swipeOffsets[conversationId] = Math.max(
      -this.swipeMaxDistance,
      Math.min(this.swipeMaxDistance, deltaX),
    );
    this.swipePreventClick.add(conversationId);
  }

  onSwipeEnd(event: PointerEvent, item: ConversationItem) {
    const conversationId = item.conversation.id;
    const tracker = this.swipeTrackers.get(conversationId);
    if (!tracker) return;

    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture?.(tracker.pointerId);

    const offset = this.swipeOffsets[conversationId] ?? 0;
    if (offset > this.swipeTriggerDistance) {
      this.toggleArchiveConversation(item);
    } else if (offset < -this.swipeTriggerDistance) {
      this.togglePinConversation(item);
    }

    this.resetSwipe(conversationId);
  }

  onSwipeCancel(event: PointerEvent, conversationId: string) {
    this.resetSwipe(conversationId, event.currentTarget as HTMLElement | null);
  }

  getSwipeTransform(conversationId: string) {
    const offset = this.swipeOffsets[conversationId] ?? 0;
    return `translateX(${offset}px)`;
  }

  isSwiping(conversationId: string) {
    return this.swipeTrackers.get(conversationId)?.dragging ?? false;
  }

  setTab(tab: 'conversations' | 'notifications') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
  }

  onNotificationsCountChange(count: number) {
    this.notificationsCount = count;
  }

  private subs: Subscription[] = [];
  private inboxSub?: Subscription;
  private profileCache = new Map<string, any>();

  constructor(
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
    private profiles: ProfilesService,
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
  onNewContactInput(value: string) {
    this.newContactTerm = value;
    if (this.newContactDebounce) {
      clearTimeout(this.newContactDebounce);
    }
    if (!value || value.trim().length < 2) {
      this.newContactResults = [];
      return;
    }
    this.newContactDebounce = setTimeout(() => this.fetchNewContacts(value.trim()), 250);
  }

  async fetchNewContacts(term: string) {
    this.newContactLoading = true;
    try {
      const results = await this.profiles.searchProfiles(term);
      this.newContactResults = results.slice(0, 5);
    } catch (error) {
      console.error('Unable to search contacts', error);
      this.newContactResults = [];
    } finally {
      this.newContactLoading = false;
    }
  }

  async startConversationWith(user: any) {
    if (!user?.id) return;
    const conversationId = await this.messaging.ensureConversation(user.id);
    this.newContactTerm = '';
    this.newContactResults = [];
    if (conversationId) {
      this.router.navigate(['/messagerie', conversationId]);
    }
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

    this.conversations = items.sort((a, b) => this.sortConversations(a, b));
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

  private resetSwipe(conversationId: string, target?: HTMLElement | null) {
    const tracker = this.swipeTrackers.get(conversationId);
    if (target && tracker) {
      target.releasePointerCapture?.(tracker.pointerId);
    }
    this.swipeTrackers.delete(conversationId);
    this.swipeOffsets[conversationId] = 0;
    setTimeout(() => this.swipePreventClick.delete(conversationId), 80);
  }

  private updateFiltered() {
    this.filteredConversations = this.filterConversations();
    this.visibleCount = Math.min(this.pageSize, this.filteredConversations.length);
    this.visibleConversations = this.filteredConversations.slice(0, this.visibleCount);
  }

  private filterConversations() {
    const term = this._searchTerm.trim().toLowerCase();
    return this.conversations.filter(item => {
      const isArchived = this.isArchived(item);
      if (this.activeFilter === 'archived') {
        if (!isArchived) return false;
      } else if (isArchived) {
        return false;
      }

      if (this.activeFilter === 'unread' && !item.unread) {
        return false;
      }

      if (!term) return true;
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

  private sortConversations(a: ConversationItem, b: ConversationItem) {
    const pinA = this.isPinned(a) ? 1 : 0;
    const pinB = this.isPinned(b) ? 1 : 0;
    if (pinA !== pinB) {
      return pinB - pinA;
    }
    return (b.conversation.updatedAt ?? 0) - (a.conversation.updatedAt ?? 0);
  }
}
