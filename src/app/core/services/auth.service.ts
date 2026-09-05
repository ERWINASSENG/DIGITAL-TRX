import { Injectable, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { LoginCredentials, UserProfile, UserRole } from '../models/auth.model';
import { SupabaseService } from './supabase.service';

// Clé résiduelle utilisée uniquement pour la purge défensive
const LEGACY_SESSION_STORAGE_KEY = 'transmex_auth_session';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /**
   * Helper robuste tolérant à la fois les signaux et les valeurs primitives (notamment dans les mocks de test)
   */
  private checkSupabaseConfigured(): boolean {
    const configured = this.supabaseService.isConfigured;
    if (typeof configured === 'function') {
      return configured();
    }
    return Boolean(configured);
  }

  // Signaux réactifs pour l'état d'authentification (Strictement en mémoire volatile)
  private readonly _currentUser = signal<UserProfile | null>(null);
  private readonly _token = signal<string | null>(null);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _authError = signal<string | null>(null);

  // Protection contre les attaques par force brute
  private readonly loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly LOGIN_ATTEMPT_LIMIT = 5;
  private readonly LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes de verrouillage

  // Signaux publics dérivés
  public readonly currentUser = this._currentUser.asReadonly();
  public readonly token = this._token.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly authError = this._authError.asReadonly();

  public readonly isAuthenticated = computed(() => this._currentUser() !== null);
  public readonly currentRole = computed<UserRole | null>(() => this._currentUser()?.role ?? null);
  public readonly isAdmin = computed(() => this._currentUser()?.role === 'admin');
  public readonly isRH = computed(() => this._currentUser()?.role === 'rh' || this._currentUser()?.role === 'admin');

  constructor() {
    this.purgeLegacyStorageTokens();
    this.restoreSession();
    this.listenToAuthChanges();
  }

  /**
   * Purge défensive des anciens tokens JWT éventuellement présents dans localStorage
   */
  private purgeLegacyStorageTokens(): void {
    if (this.isBrowser && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      } catch {
        // Ignorer si localStorage restreint
      }
    }
  }

  /**
   * Écoute les changements d'état d'authentification Supabase
   */
  private listenToAuthChanges(): void {
    if (this.checkSupabaseConfigured() && this.supabaseService.supabase) {
      try {
        this.supabaseService.supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            await this.loadUserProfileFromSupabase(
              session.user.id,
              session.user.email || '',
              session.access_token,
              session.user
            );
          } else if (event === 'SIGNED_OUT') {
            this.clearLocalSession();
          }
        });
      } catch {
        // Ignorer si échec d'écoute
      }
    }
  }

  /**
   * Récupère le profil complet depuis la table public.profiles
   * et extrait le rôle de manière étanche depuis app_metadata
   */
  private async loadUserProfileFromSupabase(
    userId: string,
    email: string,
    accessToken: string,
    authUser?: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null
  ): Promise<UserProfile | null> {
    if (!this.supabaseService.supabase) return null;

    try {
      const { data: profile } = await this.supabaseService.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Priorité étanche au rôle app_metadata (inaltérable par l'utilisateur)
      const appRole = authUser?.app_metadata?.['role'] as UserRole | undefined;
      const userMetaRole = authUser?.user_metadata?.['role'] as UserRole | undefined;
      const profileRole = profile?.role as UserRole | undefined;

      const resolvedRole: UserRole = profileRole || appRole || userMetaRole || 'agent';

      const userProfile: UserProfile = {
        id: userId,
        email: email || profile?.email || '',
        firstName: profile?.first_name || (authUser?.user_metadata?.['first_name'] as string) || 'Utilisateur',
        lastName: profile?.last_name || (authUser?.user_metadata?.['last_name'] as string) || 'Transmex',
        role: resolvedRole,
        roles: [resolvedRole],
        department: profile?.department || 'Services Généraux',
        phone: profile?.phone,
        isActive: profile?.is_active ?? true,
        avatarUrl: profile?.avatar_url,
        createdAt: profile?.created_at || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      this.setLocalSession(userProfile, accessToken);
      return userProfile;
    } catch {
      return null;
    }
  }

  /**
   * Restaure la session uniquement depuis Supabase en mémoire si disponible.
   * Ne lit jamais de tokens JWT depuis localStorage (élimination de la vulnérabilité XSS).
   */
  public async restoreSession(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    try {
      if (this.checkSupabaseConfigured() && this.supabaseService.supabase) {
        const { data } = await this.supabaseService.supabase.auth.getSession();
        if (data.session?.user) {
          await this.loadUserProfileFromSupabase(
            data.session.user.id,
            data.session.user.email || '',
            data.session.access_token,
            data.session.user
          );
        }
      }
    } catch {
      // Ignorer si échec de restauration
    }
  }

  /**
   * Vérifie les quotas de tentatives de connexion pour limiter les attaques par force brute
   */
  private checkRateLimit(email: string): { allowed: boolean; remainingMinutes?: number } {
    const now = Date.now();
    const record = this.loginAttempts.get(email);

    if (!record) {
      return { allowed: true };
    }

    if (now - record.lastAttempt > this.LOGIN_LOCKOUT_MS) {
      this.loginAttempts.delete(email);
      return { allowed: true };
    }

    if (record.count >= this.LOGIN_ATTEMPT_LIMIT) {
      const remainingMinutes = Math.ceil((this.LOGIN_LOCKOUT_MS - (now - record.lastAttempt)) / 60000);
      return { allowed: false, remainingMinutes };
    }

    return { allowed: true };
  }

  private recordFailedAttempt(email: string): void {
    const now = Date.now();
    const record = this.loginAttempts.get(email);
    if (!record || now - record.lastAttempt > this.LOGIN_LOCKOUT_MS) {
      this.loginAttempts.set(email, { count: 1, lastAttempt: now });
    } else {
      this.loginAttempts.set(email, { count: record.count + 1, lastAttempt: now });
    }
  }

  private resetLoginAttempts(email: string): void {
    this.loginAttempts.delete(email);
  }

  /**
   * Connexion sécurisée par email et mot de passe via Supabase Auth
   */
  public async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    this._isLoading.set(true);
    this._authError.set(null);

    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    // Protection anti force-brute
    const rateLimit = this.checkRateLimit(email);
    if (!rateLimit.allowed) {
      const errorMsg = `Trop de tentatives échouées pour ce compte. Veuillez patienter ${rateLimit.remainingMinutes} minute(s) avant de réessayer.`;
      this._authError.set(errorMsg);
      this._isLoading.set(false);
      return { success: false, error: errorMsg };
    }

    try {
      // S'assurer que le client Supabase a résolu sa configuration (TransferState ou API)
      await this.supabaseService.ensureInitialized();

      if (!this.checkSupabaseConfigured() || !this.supabaseService.supabase) {
        throw new Error(
          "Le service Supabase n'est pas configuré. Veuillez renseigner SUPABASE_URL et SUPABASE_ANON_KEY."
        );
      }

      const { data, error } = await this.supabaseService.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        this.recordFailedAttempt(email);
        let friendlyError = error.message;
        if (error.message.includes('Invalid login credentials')) {
          friendlyError = 'Identifiants invalides : email ou mot de passe incorrect.';
        } else if (error.message.includes('Email not confirmed')) {
          friendlyError = "L'adresse email n'a pas encore été confirmée dans Supabase.";
        }
        throw new Error(friendlyError);
      }

      if (data.user) {
        const profile = await this.loadUserProfileFromSupabase(
          data.user.id,
          data.user.email || email,
          data.session?.access_token || 'supabase-token',
          data.user
        );

        if (!profile) {
          throw new Error('Profil utilisateur introuvable dans la base de données.');
        }

        if (!profile.isActive) {
          await this.supabaseService.supabase.auth.signOut();
          this.clearLocalSession();
          throw new Error('Ce compte utilisateur a été désactivé. Veuillez contacter un administrateur.');
        }

        this.resetLoginAttempts(email);
        this._isLoading.set(false);
        this.redirectAfterLogin();
        return { success: true };
      }

      throw new Error('Identifiants invalides ou échec de connexion.');
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Une erreur est survenue lors de la connexion';
      this._authError.set(errMessage);
      this._isLoading.set(false);
      return { success: false, error: errMessage };
    }
  }

  /**
   * Inscription d'un nouvel utilisateur dans Supabase Auth
   */
  public async signUp(email: string, password: string, profileData: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> {
    this._isLoading.set(true);
    this._authError.set(null);

    try {
      if (this.checkSupabaseConfigured() && this.supabaseService.supabase) {
        const { data, error } = await this.supabaseService.supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              first_name: profileData.firstName,
              last_name: profileData.lastName,
              role: profileData.role || 'agent',
              department: profileData.department || 'Services Généraux',
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          // Création correspondante dans public.profiles
          await this.supabaseService.supabase.from('profiles').upsert({
            id: data.user.id,
            email: email.trim().toLowerCase(),
            first_name: profileData.firstName || '',
            last_name: profileData.lastName || '',
            role: profileData.role || 'agent',
            department: profileData.department || 'Services Généraux',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      this._isLoading.set(false);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la création du compte";
      this._authError.set(msg);
      this._isLoading.set(false);
      return { success: false, error: msg };
    }
  }

  /**
   * Vérifie si l'utilisateur connecté possède un rôle donné
   */
  public hasRole(requiredRoles: UserRole | UserRole[]): boolean {
    const current = this._currentUser();
    if (!current || !current.isActive) return false;
    
    // L'administrateur a un accès complet universel
    if (current.role === 'admin') return true;

    const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return rolesArray.includes(current.role);
  }

  /**
   * Déconnexion sécurisée et réinitialisation de session
   */
  public async logout(): Promise<void> {
    if (this.supabaseService.supabase) {
      try {
        await this.supabaseService.supabase.auth.signOut();
      } catch {
        // Ignorer en mode local
      }
    }

    this.clearLocalSession();
    this.router.navigate(['/auth/login']);
  }

  /**
   * Efface la session locale en mémoire vive
   */
  private clearLocalSession(): void {
    if (this.isBrowser) {
      try {
        localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      } catch {
        // Ignorer
      }
    }
    this._currentUser.set(null);
    this._token.set(null);
    this._authError.set(null);
  }

  /**
   * Sauvegarde interne de session strictement en mémoire vive (Signals).
   * Aucun jeton d'accès n'est stocké dans localStorage (Protection anti-XSS).
   */
  public setLocalSession(user: UserProfile, token: string): void {
    this._currentUser.set(user);
    this._token.set(token);
    this._authError.set(null);

    // Purge proactive au cas où une ancienne clé persiste
    if (this.isBrowser) {
      try {
        localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      } catch {
        // Ignorer
      }
    }
  }

  /**
   * Redirection post-authentification
   */
  private redirectAfterLogin(): void {
    this.router.navigate(['/dashboard']);
  }
}

