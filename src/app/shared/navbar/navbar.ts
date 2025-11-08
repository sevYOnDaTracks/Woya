import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { CommonModule } from '@angular/common';
import { MessagingService } from '../../core/services/messaging';
import { Subscription } from 'rxjs';
import { Services } from '../../core/services/services';
import { ProfilesService } from '../../core/services/profiles';
import { collection, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { firebaseServices } from '../../app.config';

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
  logoutConfirmOpen = false;
  pendingRequests = 0;
  pendingReservations = 0;
  currentUser: any | null = null;

  private currentUid: string | null = null;
  private authSub?: Subscription;
  private inboxSub?: Subscription;
  private providerBookingsSub?: Unsubscribe;
  private clientBookingsSub?: Unsubscribe;
  searchTerm = '';
  searchResults: SearchResult[] = [];
  searchOpen = false;
  searchLoading = false;
  private searchDebounce?: any;
  private searchMin = 2;

  constructor(
    public auth: AuthStore,
    private router: Router,
    private messaging: MessagingService,
    private services: Services,
    private profiles: ProfilesService,
  ) {}

  ngOnInit(): void {
    this.authSub = this.auth.user$.subscribe(user => {
      this.currentUser = user ?? null;
      const uid = this.currentUser?.uid ?? null;
      if (this.currentUid === uid) {
        if (!uid) {
          this.clearInbox();
          this.closeUserMenu();
        }
        return;
      }

      this.currentUid = uid;
      if (!this.currentUid) {
        this.currentUser = null;
        this.clearInbox();
        this.clearBookingCounters();
        this.closeUserMenu();
        return;
      }

      this.bindInbox();
      this.bindBookingCounters();
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.clearInbox();
    this.clearBookingCounters();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      this.userMenuOpen = false;
      this.logoutConfirmOpen = false;
    }
    if (!this.isMenuOpen) {
      this.logoutConfirmOpen = false;
    }
  }

  requestLogout() {
    this.logoutConfirmOpen = true;
    this.userMenuOpen = false;
    this.isMenuOpen = false;
  }

  confirmLogout() {
    this.performLogout();
  }

  cancelLogout() {
    this.logoutConfirmOpen = false;
  }

  private performLogout() {
    if (!this.logoutConfirmOpen) return;
    this.auth.logout();
    this.closeUserMenu();
    this.isMenuOpen = false;
    this.logoutConfirmOpen = false;
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

  private bindBookingCounters() {
    this.clearBookingCounters();
    if (!this.currentUid) return;
    const col = collection(firebaseServices.db, 'bookings');

    this.providerBookingsSub = onSnapshot(query(col, where('providerId', '==', this.currentUid)), snapshot => {
      const now = Date.now();
      this.pendingRequests = snapshot.docs.filter(docSnap => {
        const data = docSnap.data() as any;
        const status = data.status ?? 'pending';
        const startTime = this.toMillis(data.startTime) ?? 0;
        return status === 'pending' && startTime >= now;
      }).length;
    });

    this.clientBookingsSub = onSnapshot(query(col, where('clientId', '==', this.currentUid)), snapshot => {
      const now = Date.now();
      this.pendingReservations = snapshot.docs.filter(docSnap => {
        const data = docSnap.data() as any;
        const status = data.status ?? 'pending';
        const startTime = this.toMillis(data.startTime) ?? 0;
        return status === 'pending' && startTime >= now;
      }).length;
    });
  }

  private clearBookingCounters() {
    this.providerBookingsSub?.();
    this.clientBookingsSub?.();
    this.providerBookingsSub = undefined;
    this.clientBookingsSub = undefined;
    this.pendingRequests = 0;
    this.pendingReservations = 0;
  }

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  closeUserMenu() {
    this.userMenuOpen = false;
    this.logoutConfirmOpen = false;
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (this.userMenuOpen) {
      if (target && target.closest('.user-menu')) {
        // keep open
      } else {
        this.userMenuOpen = false;
      }
    }
    if (this.searchOpen) {
      if (target && target.closest('.global-search')) {
        // keep open
      } else {
        this.closeSearchDropdown();
      }
    }
  }

  displayName(user: any | null | undefined) {
    if (!user) return 'Profil';
    if (user.pseudo && user.pseudo.trim().length > 0) {
      return user.pseudo;
    }
    const firstname = user.firstname || 'Profil';
    const lastname = user.lastname ? ` ${user.lastname}` : '';
    return `${firstname}${lastname}`;
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }

  onSearchInput(value: string) {
    this.searchTerm = value;
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    if (!value || value.trim().length < this.searchMin) {
      this.searchResults = [];
      this.searchOpen = false;
      return;
    }
    this.searchDebounce = setTimeout(() => this.fetchSearchSuggestions(value.trim()), 250);
  }

  onSearchFocus() {
    if (this.searchResults.length) {
      this.searchOpen = true;
    }
  }

  async fetchSearchSuggestions(term: string) {
    this.searchLoading = true;
    this.searchOpen = true;
    try {
      const [services, users] = await Promise.all([
        this.services.searchServices(term, 5),
        this.profiles.searchProfiles(term).then(list => list.slice(0, 5)),
      ]);
      const results: SearchResult[] = [
        ...users.map(user => ({
          id: user.id,
          label: this.displayName(user),
          description: user.profession || user.city || '',
          avatar: user.photoURL,
          route: ['/prestataires', user.id],
          kind: 'user' as const,
        })),
        ...services.map(service => ({
          id: service.id!,
          label: service.title,
          description: `${service.category} • ${service.city || 'Ville non renseignée'}`,
          avatar: service.coverUrl,
          route: ['/services', service.id!],
          kind: 'service' as const,
        })),
      ];
      this.searchResults = results.slice(0, 8);
    } finally {
      this.searchLoading = false;
    }
  }

  goToResult(result: SearchResult) {
    this.router.navigate(result.route);
    this.closeSearchDropdown();
  }

  submitSearch() {
    const term = this.searchTerm.trim();
    if (!term) return;
    this.closeSearchDropdown();
    this.router.navigate(['/recherche'], { queryParams: { term } });
  }

  closeSearchDropdown() {
    this.searchOpen = false;
  }
}

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  avatar?: string | null;
  route: any[];
  kind: 'service' | 'user';
}
