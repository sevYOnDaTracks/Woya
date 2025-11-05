import { OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { SharedImports } from '../../shared/shared-imports';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';

@Component({
  selector: 'app-list-services',
  standalone: true,
  imports: [...SharedImports],
  templateUrl: './list-services.html',
})
export default class ListServices implements OnInit {

  services: WoyaService[] = [];
  filtered: WoyaService[] = [];

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

  constructor(private api: Services) {}

  async ngOnInit() {
    this.services = await this.api.list();
    this.applyFilter();
  }

  applyFilter() {
    const q = this.q.toLowerCase();
    this.filtered = this.services.filter(s =>
      ([s.title, s.description, s.city, s.category].join(' ').toLowerCase().includes(q)
       && (this.category === 'Toutes' || s.category === this.category))
    );
  }

  phoneToWhatsApp(phone: string) {
    return 'https://wa.me/' + phone.replace(/[^0-9]/g, '');
  }
}
