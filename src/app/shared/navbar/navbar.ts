import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { CommonModule } from '@angular/common';
import { MessagingService } from '../../core/services/messaging';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, CommonModule, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit, OnDestroy {
  isMenuOpen = false;
  unreadCount = 0;
  userMenuOpen = false;

  private currentUid: string | null = null;
  private authSub?: Subscription;
  private inboxSub?: Subscription;

  constructor(public auth: AuthStore, private router: Router, private messaging: MessagingService) {}

  ngOnInit(): void {
    this.authSub = this.auth.user$.subscribe(user => {
      const uid = user?.uid ?? null;
      if (this.currentUid === uid) {
        if (!uid) {
          this.clearInbox();
          this.closeUserMenu();
        }
        return;
      }

      this.currentUid = uid;
      if (!this.currentUid) {
        this.clearInbox();
        this.closeUserMenu();
        return;
      }

      this.bindInbox();
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.clearInbox();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      this.userMenuOpen = false;
    }
  }

  logout() {
    this.auth.logout();
    this.closeUserMenu();
    this.isMenuOpen = false;
    this.router.navigate(['/']);
  }

  private bindInbox() {
    this.clearInbox();

    if (!this.currentUid) {
      return;
    }

    this.inboxSub = this.messaging.listenInbox(this.currentUid).subscribe({
      next: conversations => {
        this.unreadCount = conversations.reduce((count, conversation) => {
          return count + ((conversation.readBy ?? []).includes(this.currentUid!) ? 0 : 1);
        }, 0);
      },
      error: error => console.error('Unable to load inbox in navbar', error),
    });
  }

  private clearInbox() {
    this.inboxSub?.unsubscribe();
    this.inboxSub = undefined;
    this.unreadCount = 0;
  }

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  closeUserMenu() {
    this.userMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent) {
    if (!this.userMenuOpen) return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest('.user-menu')) return;
    this.userMenuOpen = false;
  }
}
