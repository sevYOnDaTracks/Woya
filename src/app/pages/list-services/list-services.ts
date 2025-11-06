import { OnInit, AfterViewInit } from '@angular/core';
import { Component } from '@angular/core';
import { SharedImports } from '../../shared/shared-imports';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';
import { Router, RouterLink } from '@angular/router';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';

@Component({
  selector: 'app-list-services',
  standalone: true,
  imports: [...SharedImports, RouterLink, TimeAgoPipe],
  templateUrl: './list-services.html',
})
export default class ListServices implements OnInit, AfterViewInit {

  loading = true;
  loadingMore = false;

  services: WoyaService[] = [];
  filteredAll: WoyaService[] = [];
  filtered: WoyaService[] = [];

  visibleCount = 4;

  q: string = '';
  category: string = 'Toutes';

  categories = [
    'Toutes',
    'Jardinage',
    'Ménage & Aide à domicile',
    'Cours particuliers',
    'Transport & Déménagement',
    'Informatique',
    'Bricolage / Réparation',
    'Beauté & Bien-être',
    'Garde d’enfants',
  ];

  constructor(private api: Services, private router:Router) {}

  async ngOnInit() {
    this.services = await this.api.list();
    this.services = this.services.map(s => {
      if ((s.createdAt as any)?.seconds) {
        s.createdAt = (s.createdAt as any).seconds * 1000;
      }
      return s;
    });

    this.applyFilter();
    this.loading = false;
  }

  ngAfterViewInit() {
    window.addEventListener('scroll', () => {
      if (this.loadingMore || this.loading) return;

      const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (bottom) this.loadMore();
    });
  }

  applyFilter() {
    const q = this.q.toLowerCase();

    this.filteredAll = this.services.filter(s =>
      ([s.title, s.description, s.city, s.category].join(' ').toLowerCase().includes(q)
      && (this.category === 'Toutes' || s.category === this.category))
    );

    this.filtered = this.filteredAll.slice(0, this.visibleCount);
  }

  async loadMore() {
    if (this.visibleCount >= this.filteredAll.length) return;

    this.loadingMore = true;

    setTimeout(() => {
      this.visibleCount += 5;
      this.filtered = this.filteredAll.slice(0, this.visibleCount);
      this.loadingMore = false;
    }, 800);
  }

  phoneToWhatsApp(phone: string) {
    return 'https://wa.me/' + phone.replace(/[^0-9]/g, '');
  }

  goToDetails(id: string) {
    this.router.navigate(['/services', id]);
  }

  imageIndex: { [id: string]: number } = {};
  translateX: { [id: string]: number } = {};
  dragging: { [id: string]: boolean } = {};
  touchStartX = 0;
  touchMoveX = 0;

  getCurrentImage(s: WoyaService) {
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    if (images.length === 0) return '/assets/placeholder.jpg';
    if (!(s.id! in this.imageIndex)) this.imageIndex[s.id!] = 0;
    return images[this.imageIndex[s.id!]];
  }

  nextImage(s: WoyaService, event?: Event) {
    event?.stopPropagation();
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    this.imageIndex[s.id!] = (this.imageIndex[s.id!] + 1) % images.length;
  }

  prevImage(s: WoyaService, event?: Event) {
    event?.stopPropagation();
    const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
    this.imageIndex[s.id!] = (this.imageIndex[s.id!] - 1 + images.length) % images.length;
  }

  onTouchStart(s: WoyaService, event: TouchEvent) {
    this.dragging[s.id!] = true;
    this.touchStartX = event.touches[0].clientX;
  }

  onTouchMove(s: WoyaService, event: TouchEvent) {
    if (!this.dragging[s.id!]) return;
    this.touchMoveX = event.touches[0].clientX;
    this.translateX[s.id!] = this.touchMoveX - this.touchStartX;
  }

  onTouchEnd(s: WoyaService) {
    this.dragging[s.id!] = false;
    if (this.translateX[s.id!] > 60) this.prevImage(s);
    else if (this.translateX[s.id!] < -60) this.nextImage(s);
    this.translateX[s.id!] = 0;
  }

  getImages(s: WoyaService) {
    return [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
  }

}
