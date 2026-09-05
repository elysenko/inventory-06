import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirm = group.get('confirm')?.value as string;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorBannerComponent],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly preview = PREVIEW_MODE;
  readonly previewShortcut = PREVIEW_MODE ? 'Skip login — Demo Mode' : '';

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Duplicate-email 400 from the API, surfaced against the email control. */
  readonly emailServerError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  get name() {
    return this.form.controls.name;
  }
  get email() {
    return this.form.controls.email;
  }
  get password() {
    return this.form.controls.password;
  }
  get confirm() {
    return this.form.controls.confirm;
  }

  submit(): void {
    this.error.set(null);
    this.emailServerError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields and try again.');
      return;
    }

    this.submitting.set(true);
    const { name, email, password } = this.form.getRawValue();
    this.auth.signup(email, password, name).subscribe({
      next: () => void this.router.navigate(['/items']),
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.submitting.set(false);
        if (err.status === 400) {
          this.emailServerError.set(err.error?.message ?? 'email already exists');
          return;
        }
        this.error.set('We could not create your account. Please try again.');
      },
    });
  }

  useDemoMode(): void {
    this.auth.previewSignIn('MANAGER');
  }
}
