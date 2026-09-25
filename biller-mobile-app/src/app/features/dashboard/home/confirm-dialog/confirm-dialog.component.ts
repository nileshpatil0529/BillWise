import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <mat-icon class="warn-icon">warning_amber</mat-icon>
        <h2 mat-dialog-title>{{ data.title }}</h2>
      </div>

      <mat-dialog-content>
        <p class="confirm-message">{{ data.message }}</p>
        @if (data.detail) {
          <p class="confirm-detail">{{ data.detail }}</p>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button [mat-dialog-close]="false">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button mat-flat-button color="warn" [mat-dialog-close]="true" cdkFocusInitial>
          <mat-icon>delete</mat-icon>
          {{ data.confirmLabel ?? 'Clear Cart' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .confirm-dialog { padding: 8px; min-width: 300px; max-width: 400px; }
    .confirm-dialog-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .warn-icon { color: #f59e0b; font-size: 28px; width: 28px; height: 28px; }
    h2[mat-dialog-title] { margin: 0; font-size: 1.05rem; }
    .confirm-message { font-size: 0.95rem; color: var(--mat-sys-on-surface, #333); margin: 0 0 4px; }
    .confirm-detail { font-size: 0.83rem; color: var(--mat-sys-outline, #888); margin: 4px 0 0; }
    mat-dialog-actions { padding-top: 8px; gap: 8px; }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}
}
