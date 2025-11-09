import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthService } from '../core/store/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css',
})
export default class AdminLogin implements OnInit {
  form = {
    email: '',
    password: '',
  };
  loading = false;
  error = '';
  redirectUrl = '/admin/panel';

  constructor(
    private adminAuth: AdminAuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    if (redirect) {
      this.redirectUrl = redirect;
    }
    if (this.adminAuth.isAuthenticated()) {
      this.router.navigateByUrl(this.redirectUrl);
    }
  }

  async submit() {
    this.loading = true;
    this.error = '';
    try {
      const ok = this.adminAuth.login(this.form.email, this.form.password);
      if (ok) {
        await this.router.navigateByUrl(this.redirectUrl);
      } else {
        this.error = 'Identifiants administrateur invalides.';
      }
    } finally {
      this.loading = false;
    }
  }
}
