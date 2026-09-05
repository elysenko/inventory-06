import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, of, tap } from 'rxjs';

import type { Role, User } from '../shared/models';
import { API_BASE } from './api-base';
import { readJson, removeKeys, writeJson, writeRaw } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

/** Routes that must stay reachable without a session. */
const PUBLIC_SEGMENTS = ['login', 'signup'];

const ROLES: readonly Role[] = ['ADMIN', 'MANAGER', 'CLERK', 'USER'];

/** Anything read back from browser storage is untrusted — validate the shape. */
function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['email'] === 'string' &&
    typeof candidate['role'] === 'string' &&
    (ROLES as readonly string[]).includes(candidate['role'] as string)
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  /** ADMIN satisfies every MANAGER-only check. */
  readonly isManager = computed(() => {
    const role = this.user()?.role;
    return role === 'ADMIN' || role === 'MANAGER';
  });

  constructor() {
    this.restore();
  }

  /**
   * Rehydrate the session. Never throws and never blanks the page: an
   * unrecognised stored value is discarded and the app continues signed out.
   */
  restore(): void {
    let stored: unknown = null;
    try {
      stored = readJson<unknown>(USER_KEY);
    } catch {
      stored = null;
    }

    if (isUser(stored)) {
      this.user.set(stored);
      return;
    }
    if (stored !== null) {
      removeKeys(USER_KEY, TOKEN_KEY);
    }

    if (COLOSSUS_PREVIEW) {
      // Static preview has no API. Treat a cold load of an authenticated route
      // as already signed in so every screen is deep-linkable, while /login and
      // /signup stay directly reachable and reviewable.
      const segment =
        (typeof window !== 'undefined'
          ? window.location.pathname.split('/').filter(Boolean).pop()
          : '') ?? '';
      if (!PUBLIC_SEGMENTS.includes(segment)) {
        this.seedPreviewSession('MANAGER');
      }
    }
  }

  login(email: string, password: string): Observable<User> {
    if (COLOSSUS_PREVIEW) {
      // Resolved locally and synchronously — a network call would fail on the
      // static preview host and strand the reviewer on the sign-in screen.
      const address = email.trim();
      const role: Role = /^(clerk|user)/i.test(address) ? 'CLERK' : 'MANAGER';
      return of(this.seedSession({ id: 'preview-user', email: address, role }));
    }
    return this.http
      .post<{ token: string; user: User }>(`${API_BASE}/auth/login`, {
        email,
        password,
      })
      .pipe(
        tap((res) => this.setSession(res.user, res.token)),
        map((res) => res.user),
      );
  }

  signup(email: string, password: string): Observable<User> {
    if (COLOSSUS_PREVIEW) {
      return of(
        this.seedSession({
          id: 'preview-user',
          email: email.trim(),
          role: 'CLERK',
        }),
      );
    }
    return this.http
      .post<{ token: string; user: User }>(`${API_BASE}/auth/signup`, {
        email,
        password,
      })
      .pipe(
        tap((res) => this.setSession(res.user, res.token)),
        map((res) => res.user),
      );
  }

  logout(): void {
    removeKeys(USER_KEY, TOKEN_KEY);
    this.user.set(null);
    void this.router.navigate(['/login']);
  }

  /**
   * Preview-only shortcut: seeds the signed-in state directly and lands on the
   * authenticated home screen. Needs no credentials of any kind.
   */
  previewSignIn(role: Role = 'MANAGER'): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    this.seedPreviewSession(role);
    void this.router.navigate(['/items']);
  }

  /** Preview-only: re-enter the app as the other role to review role gating. */
  previewSwitchRole(role: Role): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    this.seedPreviewSession(role);
    void this.router.navigate(['/items']);
  }

  private seedPreviewSession(role: Role): User {
    return this.seedSession({
      id: `preview-${role.toLowerCase()}`,
      email:
        role === 'CLERK'
          ? 'preview.clerk@stockroom.local'
          : 'preview.manager@stockroom.local',
      role,
    });
  }

  private seedSession(user: User): User {
    this.setSession(user, 'preview-session');
    return user;
  }

  private setSession(user: User, token: string): void {
    writeJson(USER_KEY, user);
    writeRaw(TOKEN_KEY, token);
    this.user.set(user);
  }
}
