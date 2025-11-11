import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import ClientBookings from './client-bookings';
import ProviderBookings from './provider-bookings';

type AgendaTab = 'client' | 'provider';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [...SharedImports, ClientBookings, ProviderBookings],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export default class AgendaPage implements OnInit, OnDestroy {
  activeTab: AgendaTab = 'client';
  readonly tabs: { id: AgendaTab; label: string; subtitle: string }[] = [
    { id: 'client', label: 'Mes Réservations', subtitle: 'tes réservations par rapport à une offre' },
    { id: 'provider', label: 'Demandes reçues', subtitle: 'Les demandes que tu as reçus de tes clients' },
  ];

  private querySub?: Subscription;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    const initialTab = this.getInitialTab();
    this.activeTab = initialTab;
    if (!this.route.snapshot.queryParamMap.has('tab')) {
      this.updateQueryParams(initialTab, true);
    }

    this.querySub = this.route.queryParamMap.subscribe(params => {
      const tab = this.normalizeTab(params.get('tab'));
      if (tab && tab !== this.activeTab) {
        this.activeTab = tab;
      }
    });
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
  }

  selectTab(tab: AgendaTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.updateQueryParams(tab);
  }

  private getInitialTab(): AgendaTab {
    const fromQuery = this.normalizeTab(this.route.snapshot.queryParamMap.get('tab'));
    if (fromQuery) {
      return fromQuery;
    }
    const fromData = this.normalizeTab(this.route.snapshot.data?.['defaultTab']);
    return fromData ?? 'client';
  }

  private updateQueryParams(tab: AgendaTab, replaceUrl = false) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  private normalizeTab(value: string | null | undefined): AgendaTab | null {
    return value === 'provider' ? 'provider' : value === 'client' ? 'client' : null;
  }
}
