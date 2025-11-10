import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { LoadingIndicatorService } from '../../core/services/loading-indicator.service';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-overlay" *ngIf="loadingService.loading$ | async">
      <div class="loading-overlay__spinner"></div>
    </div>
  `,
  styleUrls: ['./loading-overlay.css'],
})
export class LoadingOverlay {
  constructor(public loadingService: LoadingIndicatorService) {}
}
