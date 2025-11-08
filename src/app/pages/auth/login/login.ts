import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth';
import { FacebookAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseServices } from '../../../app.config';
import { AuthStore } from '../../../core/store/auth.store';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html'
})
export default class Login implements OnInit {

  email = '';
  password = '';
  loading = false;
  isLoggedIn = false;

  constructor(private auth: AuthService , private router : Router, private authStore: AuthStore) {}

  ngOnInit() {
    this.authStore.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      if (this.isLoggedIn) {
        this.router.navigate(['/mon-espace']);
      }
    });
  }

  async login() {
    this.loading = true;
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigate(['/mon-espace']);
    } catch (e) {
      alert("Identifiants incorrects");
    }
    this.loading = false;
  }


 loginWithGoogle() {
    this.auth.googleLogin().then((result) => {
      console.log(result);
      this.router.navigate(['/mon-espace']);
    }).catch((error) => {
      // Handle login error
    });
  }

async loginWithFacebook() {
  const provider = new FacebookAuthProvider();
  const cred = await signInWithPopup(firebaseServices.auth, provider);
  await this.router.navigate(['/mon-espace']);
  return cred.user; // ✅ renvoie le user
}

}
