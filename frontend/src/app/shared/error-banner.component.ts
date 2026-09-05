import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Inline, dismissible failure notice used by every list and form screen. */
@Component({
  selector: 'app-error-banner',
  standalone: true,
  templateUrl: './error-banner.component.html',
  styleUrl: './error-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBannerComponent {
  @Input({ required: true }) message!: string | null;
  @Input() tone: 'error' | 'warn' | 'success' = 'error';
}
