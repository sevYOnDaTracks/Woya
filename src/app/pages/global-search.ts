import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { Services } from '../core/services/services';
import { ProfilesService } from '../core/services/profiles';
import { WoyaService } from '../core/models/service.model';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [...SharedImports, RouterLink],
  templateUrl: './global-search.html',
  styleUrl: './global-search.css',
})
export default class GlobalSearch implements OnInit, OnDestroy {
  term = '';
  loading = false;
  servicesResults: WoyaService[] = [];
  userResults: any[] = [];
  private sub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private servicesApi: Services,
    private profiles: ProfilesService,
  ) {}

  ngOnInit() {
    this.sub = this.route.queryParamMap.subscribe(params => {
      this.term = params.get('term') ?? '';
      this.search();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  async search() {
    const query = this.term.trim();
    if (!query) {
      this.servicesResults = [];
      this.userResults = [];
      return;
    }
    this.loading = true;
    try {
      const [services, users] = await Promise.all([
        this.servicesApi.searchServices(query, 20),
        this.profiles.searchProfiles(query),
      ]);
      this.servicesResults = services;
      this.userResults = users;
    } finally {
      this.loading = false;
    }
  }

  displayUserName(user: any) {
    if (!user) return 'Utilisateur';
    if (user.pseudo) return user.pseudo;
    return [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || 'Utilisateur';
  }
}
