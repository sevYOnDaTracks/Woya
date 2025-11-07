import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SharedImports } from '../../shared/shared-imports';
import { firebaseServices } from '../../app.config';
import { doc, getDoc } from 'firebase/firestore';
import { WoyaService } from '../../core/models/service.model';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';


@Component({
  selector: 'app-service-details',
  standalone: true,
  imports: [...SharedImports, TimeAgoPipe , RouterLink],
  templateUrl: './service-details.html'
})
export class ServiceDetails {

  service!: WoyaService;
  gallery: string[] = [];
  currentIndex = 0;
  owner: any = null;

  constructor(private route: ActivatedRoute) {
    this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const ref = doc(firebaseServices.db, 'services', id);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as WoyaService;

      this.service = {
        id: snap.id,
        ...data
      };

      // ✅ Convert Timestamp → millisecondes
      if (this.service.createdAt && (this.service.createdAt as any).seconds) {
        this.service.createdAt = (this.service.createdAt as any).seconds * 1000;
      }

      this.gallery = [
        this.service.coverUrl ?? '',
        ...(this.service.extraImages ?? [])
      ].filter((url): url is string => !!url);

      if (!this.gallery.length) {
        this.gallery = ['assets/placeholder.jpg'];
      }

      if (this.service.ownerId) {
        await this.loadOwner(this.service.ownerId);
      }
    }
  }


  prev() {
    if (this.gallery.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.gallery.length) % this.gallery.length;
  }

  next() {
    if (this.gallery.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.gallery.length;
  }

  whatsapp() {
    const phone = this.service.contact.replace(/[^0-9]/g, '');
    return `https://wa.me/${phone}`;
  }

  call() {
    window.location.href = `tel:${this.service.contact}`;
  }

  private async loadOwner(ownerId: string) {
    try {
      const ref = doc(firebaseServices.db, 'users', ownerId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.owner = { id: snap.id, ...snap.data() };
      }
    } catch (error) {
      console.error('Unable to load owner information', error);
      this.owner = null;
    }
  }
}
