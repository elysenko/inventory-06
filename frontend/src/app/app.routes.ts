import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { managerGuard } from './core/manager.guard';

/**
 * Every navigable state of StockRoom is a route, so each screen is
 * deep-linkable and restorable from its URL. List filters, the item-detail tab
 * and the movement-form prefill all live in query params.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'items' },
  {
    path: 'login',
    data: { flow: 'auth.login' },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth.signup' },
    loadComponent: () =>
      import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'items',
    data: { flow: 'items.list' },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/items/item-list.component').then(
        (m) => m.ItemListComponent,
      ),
  },
  {
    path: 'items/new',
    data: { flow: 'items.create' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/items/item-form.component').then(
        (m) => m.ItemFormComponent,
      ),
  },
  {
    path: 'items/:id',
    data: { flow: 'items.detail' },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/items/item-detail.component').then(
        (m) => m.ItemDetailComponent,
      ),
  },
  {
    path: 'items/:id/edit',
    data: { flow: 'items.edit' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/items/item-form.component').then(
        (m) => m.ItemFormComponent,
      ),
  },
  {
    path: 'locations',
    data: { flow: 'locations.list' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/locations/location-list.component').then(
        (m) => m.LocationListComponent,
      ),
  },
  {
    path: 'locations/new',
    data: { flow: 'locations.create' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/locations/location-form.component').then(
        (m) => m.LocationFormComponent,
      ),
  },
  {
    path: 'locations/:id/edit',
    data: { flow: 'locations.edit' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/locations/location-form.component').then(
        (m) => m.LocationFormComponent,
      ),
  },
  {
    path: 'movements/new',
    data: { flow: 'movements.create' },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/movements/movement-form.component').then(
        (m) => m.MovementFormComponent,
      ),
  },
  {
    path: 'movements',
    data: { flow: 'movements.log' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/movements/movement-log.component').then(
        (m) => m.MovementLogComponent,
      ),
  },
  {
    path: 'reports/low-stock',
    data: { flow: 'reports.lowStock' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/reports/low-stock.component').then(
        (m) => m.LowStockComponent,
      ),
  },
  {
    path: 'admin/settings',
    data: { flow: 'admin.settings' },
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/admin/settings.component').then(
        (m) => m.AdminSettingsComponent,
      ),
  },
  { path: '**', redirectTo: 'items' },
];
