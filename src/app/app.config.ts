import {
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';

import {routes} from './app.routes';

@Injectable()
export class ChunkLoadErrorHandler implements ErrorHandler {
  public handleError(error: unknown): void {
    const message = (error as { message?: string })?.message || String(error);
    if (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed') ||
      message.includes('error loading dynamically imported module')
    ) {
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 4000) {
        sessionStorage.setItem('last_chunk_reload', now.toString());
        window.location.reload();
        return;
      }
    }
    console.error(error);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: ErrorHandler, useClass: ChunkLoadErrorHandler },
  ],
};
