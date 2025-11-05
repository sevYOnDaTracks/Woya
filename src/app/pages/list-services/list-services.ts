import { OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { SharedImports } from '../../shared/shared-imports';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';
import { Router, RouterLink } from '@angular/router';
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';


@Component({
  selector: 'app-list-services',
  standalone: true,
  imports: [...SharedImports, RouterLink],
  templateUrl: './list-services.html',
})
export default class ListServices implements OnInit {


  imageIndex: { [id: string]: number } = {};

  

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

  constructor(private api: Services, private router:Router) {}

async ngOnInit() {
  this.services = await this.api.list();
  this.applyFilter();

  setTimeout(() => {
    new Swiper('.service-swiper', {
      modules: [Navigation],
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
      loop: true
    });
  }, 200);
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

goToDetails(id: string) {
  this.router.navigate(['/services', id]);
}

getCover(s: WoyaService) {
  // On prend en priorité la 1ère image du tableau
  if (s.extraImages && s.extraImages.length > 0) {
    return `url('${s.extraImages[0]}')`;
  }

  // Sinon coverUrl si encore existant
  if (s.coverUrl) {
    return `url('${s.coverUrl}')`;
  }

  // Sinon rien → affichera "Illustration"
  return '';
}

getCurrentImage(s: WoyaService) {
  const images = [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
  if (images.length === 0) return '/assets/placeholder.jpg';

  if (!this.imageIndex[s.id!]) this.imageIndex[s.id!] = 0;
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


touchStartX: number = 0;
touchMoveX: number = 0;
dragging: { [id: string]: boolean } = {};
translateX: { [id: string]: number } = {};

onTouchStart(s: WoyaService, event: TouchEvent) {
  this.dragging[s.id!] = true;
  this.touchStartX = event.touches[0].clientX;
}

onTouchMove(s: WoyaService, event: TouchEvent) {
  if (!this.dragging[s.id!]) return;
  this.touchMoveX = event.touches[0].clientX;
  this.translateX[s.id!] = this.touchMoveX - this.touchStartX; // déplacement
}

onTouchEnd(s: WoyaService) {
  this.dragging[s.id!] = false;

  if (this.translateX[s.id!] > 60) {
    this.prevImage(s);
  } else if (this.translateX[s.id!] < -60) {
    this.nextImage(s);
  }

  this.translateX[s.id!] = 0;
}

getImages(s: WoyaService) {
  return [s.coverUrl, ...(s.extraImages ?? [])].filter(i => !!i);
}


}
