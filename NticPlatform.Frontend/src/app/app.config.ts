import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter, withRouterConfig, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })
    ),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
