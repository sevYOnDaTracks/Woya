import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';

@Component({
  selector: 'app-landing',
  imports: [],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {

  constructor(private router: Router, private auth: AuthStore) {}

  exploreServices() {
    const user = this.auth.user$.value;
    if (user) {
      this.router.navigate(['/services']);
      return;
    }
    this.router.navigate(['/login']);
  }

}
