import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// ✅ Firebase Storage
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Services } from '../../core/services/services';

@Component({
  selector: 'app-new-service',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-service.html'
})
export default class NewService {

  loading = false;
  preview: string | null = null;
  file: File | null = null;


  categories = [
    'Jardinage', 'Ménage & Aide à domicile', 'Cours particuliers',
    'Transport & Déménagement', 'Informatique', 'Bricolage / Réparation',
    'Beauté & Bien-être', 'Garde d’enfants',
  ];

  form = {
    title: '',
    description: '',
    category: 'Jardinage',
    city: '',
    price: null as number | null,
    contact: '',
    coverUrl: '' // ✅ On ajoute l'URL de l'image
  };

  constructor(private api: Services, private router: Router) {}

onSelectImage(e: any) {
  this.file = e.target.files[0] ?? null;
  if (!this.file) return; // ✅ Sécurité si aucun fichier choisi

  const reader = new FileReader();
  reader.onload = () => (this.preview = reader.result as string);
  reader.readAsDataURL(this.file); // ✅ maintenant c’est garanti non-null
}


  async save() {
    if (!this.form.title || !this.form.city || !this.form.contact) return;
    this.loading = true;

    // ✅ Si une image a été sélectionnée → upload Firebase Storage
    if (this.file) {
      const storage = getStorage();
      const path = `services/${Date.now()}-${this.file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, this.file!); // ✅ on garantit que ce n'est pas null

      this.form.coverUrl = await getDownloadURL(storageRef);
    }

    // ✅ Enregistrer dans Firestore
    await this.api.create(this.form);

    this.loading = false;
    this.router.navigate(['/services']);
  }
}
