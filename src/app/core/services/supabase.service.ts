import { Injectable, PLATFORM_ID, inject, signal, makeStateKey, TransferState, REQUEST } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const SUPABASE_CONFIG_KEY = makeStateKey<SupabaseConfig>('supabase.config');

/**
 * Utilitaire pour découper un en-tête Cookie HTTP en un tableau { name, value }
 */
function parseCookieHeader(cookieHeader: string | null | undefined): { name: string; value: string }[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((cookie) => {
      const [name, ...rest] = cookie.trim().split('=');
      return { name: name.trim(), value: rest.join('=').trim() };
    })
    .filter((c) => c.name.length > 0);
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transferState = inject(TransferState);

  // Injection optionnelle de la requête HTTP entrante côté serveur (SSR)
  private readonly req = inject(REQUEST, { optional: true }) as { headers?: { get?: (name: string) => string | null; cookie?: string } } | null;

  private client: SupabaseClient | null = null;
  private readonly _isConfigured = signal<boolean>(false);
  private readonly _supabaseUrl = signal<string>('');

  public readonly isConfigured = this._isConfigured.asReadonly();
  public readonly supabaseUrl = this._supabaseUrl.asReadonly();

  private initPromise: Promise<boolean> | null = null;

  constructor() {
    this.initSupabaseClient();
  }

  /**
   * Initialise le client Supabase compatible SSR avec cookies HTTP :
   * 1. Côté serveur (SSR) : lit process.env, utilise createServerClient avec extraction des cookies de la requête HTTP.
   * 2. Côté client : lit d'abord TransferState, utilise createBrowserClient (synchro document.cookie).
   */
  public initSupabaseClient(): void {
    let url = '';
    let key = '';

    if (!this.isBrowser) {
      // Côté serveur (SSR) : lecture directe depuis l'environnement
      if (typeof process !== 'undefined' && process.env) {
        url = process.env['SUPABASE_URL'] || '';
        key = process.env['SUPABASE_ANON_KEY'] || '';
      }

      if (url && key) {
        this.transferState.set(SUPABASE_CONFIG_KEY, { url, anonKey: key });
      }
    } else {
      // Côté navigateur : récupération immédiate depuis le TransferState
      const transferredConfig = this.transferState.get(SUPABASE_CONFIG_KEY, null);
      if (transferredConfig && transferredConfig.url && transferredConfig.anonKey) {
        url = transferredConfig.url;
        key = transferredConfig.anonKey;
      }
    }

    this.applyConfig(url, key);

    // Si côté navigateur la configuration n'était pas dans le TransferState,
    // interroger l'endpoint /api/supabase-config.
    if (this.isBrowser && !this._isConfigured()) {
      this.ensureInitialized();
    }
  }

  /**
   * Garantit que le client Supabase est initialisé avant toute action (login, requêtes).
   */
  public async ensureInitialized(): Promise<boolean> {
    if (this._isConfigured() && this.client) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!this.isBrowser) {
        return this._isConfigured();
      }

      try {
        const response = await fetch('/api/supabase-config');
        if (response.ok) {
          const config: SupabaseConfig = await response.json();
          if (config.url && config.anonKey) {
            this.applyConfig(config.url, config.anonKey);
            return this._isConfigured();
          }
        }
      } catch {
        // En cas d'erreur de requête
      }

      return this._isConfigured();
    })();

    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  private applyConfig(url: string, key: string): void {
    const isValid = !!(
      url &&
      key &&
      (url.startsWith('https://') || url.startsWith('http://')) &&
      !url.includes('placeholder') &&
      !url.includes('your-project') &&
      !url.includes('demo-transmex')
    );

    this._isConfigured.set(isValid);
    this._supabaseUrl.set(url);

    if (isValid) {
      try {
        if (this.isBrowser) {
          // Client Navigateur : createBrowserClient gère automatiquement document.cookie
          this.client = createBrowserClient(url, key);
        } else {
          // Client Serveur (SSR) : createServerClient extrait les cookies de la requête HTTP entrante
          const requestObj = this.req;
          this.client = createServerClient(url, key, {
            cookies: {
              getAll: () => {
                let cookieString = '';
                if (requestObj) {
                  if (typeof requestObj.headers?.get === 'function') {
                    cookieString = requestObj.headers.get('cookie') || '';
                  } else if (requestObj.headers?.cookie) {
                    cookieString = requestObj.headers.cookie;
                  }
                }
                return parseCookieHeader(cookieString);
              },
              setAll: () => {
                // Pendant le rendu SSR, le serveur lit les cookies de la requête entrante.
                // Les modifications/rafraîchissements de cookies sont appliqués côté navigateur post-hydratation.
              },
            },
          });
        }
      } catch {
        this.client = null;
        this._isConfigured.set(false);
      }
    } else {
      this.client = null;
    }
  }

  /**
   * Permet de configurer manuellement l'URL et la clé anonyme en mémoire si nécessaire.
   */
  public updateConfig(config: SupabaseConfig): boolean {
    if (!config.url || !config.anonKey) return false;
    this.applyConfig(config.url, config.anonKey);
    return this._isConfigured();
  }

  /**
   * Retourne l'instance du client Supabase
   */
  get supabase(): SupabaseClient | null {
    return this.client;
  }
}
