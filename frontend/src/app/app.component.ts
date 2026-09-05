import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './core/auth.service';
import type { Role } from './shared/models';

interface NavItem {
  label: string;
  short: string;
  path: string;
  icon: string;
  managerOnly: boolean;
  exact: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  /** Preview-only affordances (role switcher) compile out of production. */
  readonly preview = COLOSSUS_PREVIEW;

  readonly url = signal(this.router.url);
  readonly drawerOpen = signal(false);

  /** Sign-in and sign-up render standalone, without the app chrome. */
  readonly chromeless = computed(() => {
    const path = this.url().split('?')[0];
    return path.endsWith('/login') || path.endsWith('/signup');
  });

  readonly navItems = signal<NavItem[]>([
    { label: 'Items', short: 'Items', path: '/items', icon: '▦', managerOnly: false, exact: false },
    { label: 'Record movement', short: 'Record', path: '/movements/new', icon: '⇄', managerOnly: false, exact: true },
    { label: 'Movement log', short: 'Log', path: '/movements', icon: '☰', managerOnly: true, exact: true },
    { label: 'Locations', short: 'Zones', path: '/locations', icon: '⌗', managerOnly: true, exact: false },
    { label: 'Low stock', short: 'Low', path: '/reports/low-stock', icon: '⚑', managerOnly: true, exact: false },
    { label: 'Admin settings', short: 'Admin', path: '/admin/settings', icon: '⚙', managerOnly: true, exact: false },
  ]);

  readonly visibleNav = computed(() =>
    this.navItems().filter((item) => !item.managerOnly || this.auth.isManager()),
  );

  readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'CLERK' || role === 'USER' ? 'Clerk' : role === 'ADMIN' ? 'Admin' : 'Manager';
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        this.drawerOpen.set(false);
      });
  }

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  onRoleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as Role;
    this.auth.previewSwitchRole(value);
  }

  logout(): void {
    this.auth.logout();
  }
}
