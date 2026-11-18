import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { TranslateService } from '../../../core/services/translate.service';

export interface TopSellingItem {
  productId: string;
  name: string;
  nameHi?: string;
  category: string;
  unitPrice: number;
  imageUrl?: string;
  status: string;
  quantitySold: number;
}

const DEFAULT_MIN_PRICE = 150;
const RESULT_LIMIT = 10;

@Component({
  selector: 'app-top-selling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './top-selling.component.html',
  styleUrl: './top-selling.component.scss'
})
export class TopSellingComponent implements OnInit {
  displayedColumns: string[] = ['rank', 'name', 'unitPrice', 'quantitySold'];

  items = signal<TopSellingItem[]>([]);
  loading = signal(false);
  minPrice = signal(DEFAULT_MIN_PRICE);

  constructor(
    private productService: ProductService,
    public settingsService: SettingsService,
    public translateService: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadTopSelling();
  }

  loadTopSelling(): void {
    const minPrice = this.minPrice();
    this.loading.set(true);

    this.productService.getTopSellingProducts(minPrice, RESULT_LIMIT).subscribe({
      next: (response) => {
        if (response.success) {
          this.items.set(response.data.items || []);
        }
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      }
    });
  }

  onMinPriceChange(value: string): void {
    const parsed = parseFloat(value);
    this.minPrice.set(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }

  applyFilter(): void {
    this.loadTopSelling();
  }

  resetFilter(): void {
    this.minPrice.set(DEFAULT_MIN_PRICE);
    this.loadTopSelling();
  }

  formatCurrency(amount: number): string {
    return `${this.settingsService.settings().currency}${(amount || 0).toFixed(2)}`;
  }
}
