import { Component } from '@angular/core';
import { RouterLink , Router, RouterLinkActive} from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, CommonModule, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {

constructor(public auth: AuthStore, private router: Router) {}


  isMenuOpen = false;

toggleMenu() {
  this.isMenuOpen = !this.isMenuOpen;
}


  logout() {
    this.auth.logout();
    this.toggleMenu();
    this.router.navigate(['/']);
  }

}

