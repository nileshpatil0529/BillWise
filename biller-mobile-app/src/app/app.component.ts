import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SettingsService } from './core/services/settings.service';
import { AutoBlurService } from './core/services/auto-blur.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'biller-app';
  private settingsService = inject(SettingsService);
  private autoBlurService = inject(AutoBlurService);

  constructor() {
    // Initialize auto-blur service to prevent barcode scanner triggering buttons
    this.autoBlurService.initialize();
    
    // Apply dark-theme class to body for overlay components (mat-menu, dialogs, etc.)
    effect(() => {
      const isDark = this.settingsService.currentTheme() === 'dark';
      document.body.classList.toggle('dark-theme', isDark);
    });
  }
}
