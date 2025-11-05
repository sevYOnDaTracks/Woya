import { Component } from '@angular/core';
import { RouterLink ,Router} from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// ✅ Firebase
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Services } from '../../core/services/services';

@Component({
  selector: 'app-new-service',
  standalone: true,
  imports: [CommonModule, FormsModule , RouterLink],
  templateUrl: './new-service.html'
})
export default class NewService {

  loading = false;

  // ✅ MULTI IMAGE
  files: File[] = [];
  previews: string[] = [];

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
  };

  constructor(private api: Services, private router: Router) {}

  async save() {
    if (!this.form.title || !this.form.city || !this.form.contact) return;
    this.loading = true;

    let imageUrls: string[] = [];
    const storage = getStorage();

    // ✅ Upload toutes les images
    for (let file of this.files) {
      const path = `services/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      imageUrls.push(url);
    }

    // ✅ Première image = cover, le reste = extraImages
    const data = {
      ...this.form,
      createdAt: Date.now(),
      coverUrl: imageUrls[0] || null,
      extraImages: imageUrls.slice(1) || [],
    };

    await this.api.create(data);
    this.loading = false;
    this.router.navigate(['/services']);
  }

  onDrop(event: DragEvent) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || [] as File[])
  .filter((f: File) => f.type.startsWith('image/'));

  this.handleFiles(files);
}

onSelectImages(event: any) {
  const files = Array.from(event.target.files as File[])
  .filter((f: File) => f.type.startsWith('image/'));

  this.handleFiles(files);
}

handleFiles(files: File[]) {
  this.files.push(...files);
  this.previews = [];

  for (let file of this.files) {
    const reader = new FileReader();
    reader.onload = () => this.previews.push(reader.result as string);
    reader.readAsDataURL(file);
  }
}

removeImage(index: number) {
  this.files.splice(index, 1);
  this.previews.splice(index, 1);
}

}
