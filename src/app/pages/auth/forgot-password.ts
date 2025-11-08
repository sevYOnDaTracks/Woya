import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebaseServices } from '../../app.config';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export default class ForgotPassword {
  email = '';
  loading = false;
  success = '';
  error = '';

  constructor(private router: Router) {}

  async submit() {
    const target = this.email.trim();
    if (!target) {
      this.error = 'Merci de saisir ton adresse email.';
      this.success = '';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    try {
      await sendPasswordResetEmail(firebaseServices.auth, target);
      this.success =
        'Un email vient de t’être envoyé avec un lien pour réinitialiser ton mot de passe.';
    } catch (err: any) {
      console.error('Password reset error', err);
      if (err?.code === 'auth/user-not-found') {
        this.error = 'Aucun compte n’est associé à cette adresse.';
      } else {
        this.error = 'Impossible d’envoyer l’email pour le moment. Réessaie plus tard.';
      }
    } finally {
      this.loading = false;
    }
  }
}
