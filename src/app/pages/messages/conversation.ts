import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../../shared/shared-imports';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { MessagingService } from '../../core/services/messaging';
import { ConversationSummary, Message } from '../../core/models/conversation.model';
import { AuthStore } from '../../core/store/auth.store';

@Component({
  selector: 'app-conversation',
  standalone: true,
  imports: [...SharedImports, RouterLink, TimeAgoPipe],
  templateUrl: './conversation.html',
  styleUrl: './conversation.css',
})
export default class ConversationPage implements OnInit, OnDestroy {
  conversation?: ConversationSummary;
  messages: Message[] = [];
  otherUser: any = null;
  messageBody = '';
  currentUid: string | null = null;
  loading = true;
  sending = false;

  @ViewChild('messagesWrapper')
  private messagesWrapper?: ElementRef<HTMLDivElement>;

  private subs: Subscription[] = [];
  private messagesSub?: Subscription;
  private routeBound = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private messaging: MessagingService,
    private auth: AuthStore,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.auth.user$.subscribe(user => {
        this.currentUid = user?.uid ?? null;
        if (!this.currentUid) {
          this.router.navigate(['/login']);
          return;
        }

        if (!this.routeBound) {
          this.routeBound = true;
          this.bindRoute();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.teardownMessages();
    this.subs.forEach(s => s.unsubscribe());
  }

  async send() {
    if (!this.messageBody.trim() || !this.conversation) return;
    this.sending = true;
    try {
      const body = this.messageBody.trim();
      await this.messaging.sendMessage(this.conversation.id, body);
      this.messageBody = '';
      this.scrollToBottom();
    } finally {
      this.sending = false;
    }
  }

  trackByMessageId(_: number, message: Message) {
    return message.id;
  }

  private bindRoute() {
    const routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.loadConversation(id);
    });
    this.subs.push(routeSub);
  }

  private async loadConversation(id: string | null) {
    if (!id || !this.currentUid) return;

    this.loading = true;
    this.teardownMessages();

    const conversation = await this.messaging.getConversation(id);
    if (!conversation || !conversation.participantIds.includes(this.currentUid)) {
      this.router.navigate(['/messagerie']);
      return;
    }

    this.conversation = conversation;
    this.otherUser = await this.messaging.getUserProfile(
      conversation.participantIds.find(uid => uid !== this.currentUid) ?? this.currentUid,
    );

    if (this.otherUser?.lastSeen && (this.otherUser.lastSeen as any).seconds) {
      this.otherUser.lastSeen = (this.otherUser.lastSeen as any).seconds * 1000;
    }

    this.listenMessages();
    this.messaging.markAsRead(conversation.id);
    this.loading = false;
  }

  private listenMessages() {
    if (!this.conversation) return;

    this.messagesSub = this.messaging.listenMessages(this.conversation.id).subscribe({
      next: messages => {
        this.messages = messages;
        this.scrollToBottom();
        if (this.conversation) {
          this.messaging.markAsRead(this.conversation.id);
        }
      },
      error: err => console.error('Unable to listen to messages', err),
    });
  }

  private teardownMessages() {
    this.messagesSub?.unsubscribe();
    this.messagesSub = undefined;
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.messagesWrapper?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
