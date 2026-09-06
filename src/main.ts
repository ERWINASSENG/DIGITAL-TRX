import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

// Gestion de la récupération automatique en cas de chunk Vite périmé
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    window.location.reload();
  });
}

bootstrapApplication(App, appConfig).catch((err) => {
  const message = err?.message || String(err);
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    window.location.reload();
  } else {
    console.error(err);
  }
});
