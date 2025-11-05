import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html'
})
export default class Login {

  email = '';
  password = '';
  loading = false;

  constructor(private auth: AuthService) {}

  async login() {
    this.loading = true;
    try {
      await this.auth.login(this.email, this.password);
      window.location.href = '/services';
    } catch (e) {
      alert("Identifiants incorrects");
    }
    this.loading = false;
  }

  loginWithGoogle() {
    this.auth.googleLogin();
  }

  loginWithFacebook() {
    this.auth.facebookLogin();
  }
}
