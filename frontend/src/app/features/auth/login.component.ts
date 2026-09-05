import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorBannerComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Preview-only affordance; compiled out of the production bundle. */
  readonly preview = PREVIEW_MODE;
  readonly previewShortcut = PREVIEW_MODE ? 'Skip login — Demo Mode' : '';

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(
        'Enter a valid email address and a password of at least 6 characters.',
      );
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.goHome(),
      error: () => {
        this.submitting.set(false);
        this.error.set('We could not sign you in. Check your details and try again.');
      },
    });
  }

  useDemoMode(): void {
    this.auth.previewSignIn('MANAGER');
  }

  private goHome(): void {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    void this.router.navigateByUrl(redirect && redirect.startsWith('/') ? redirect : '/items');
  }
}
