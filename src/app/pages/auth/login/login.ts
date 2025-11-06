import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth';
import { FacebookAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseServices } from '../../../app.config';

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

  constructor(private auth: AuthService , private router : Router) {}

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
    this.auth.googleLogin().then((result) => {
      console.log(result);
      this.router.navigate(['/services/']);
    }).catch((error) => {
      // Handle login error
    });
  }

async loginWithFacebook() {
  const provider = new FacebookAuthProvider();
  const cred = await signInWithPopup(firebaseServices.auth, provider);
  return cred.user; // ✅ renvoie le user
}

}
