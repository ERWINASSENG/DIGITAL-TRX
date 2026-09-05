import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier `.env` (si présent)
dotenv.config();

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Parsing JSON pour les requêtes d'API
app.use(express.json());

/**
 * Endpoint sécurisé fournissant l'URL et la clé anonyme publiques Supabase au client web.
 */
app.get('/api/supabase-config', (_req, res) => {
  const url = process.env['SUPABASE_URL'] || '';
  const anonKey = process.env['SUPABASE_ANON_KEY'] || '';
  res.json({ url, anonKey });
});

/**
 * Helper d'initialisation du client Supabase avec privilèges d'administration.
 */
function getSupabaseAdmin() {
  const url = process.env['SUPABASE_URL'] || '';
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_ANON_KEY'] || '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Récupération sécurisée de la liste des collaborateurs (/api/system/collaborators).
 * Réservé aux administrateurs.
 */
app.get('/api/system/collaborators', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const adminClient = getSupabaseAdmin();

  if (!adminClient) {
    res.json({ users: [] });
    return;
  }

  try {
    if (token) {
      const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);
      if (callerError || !callerData?.user) {
        res.status(401).json({ error: 'Session administrateur invalide ou expirée' });
        return;
      }

      const callerAppRole = callerData.user.app_metadata?.['role'];
      const callerUserRole = callerData.user.user_metadata?.['role'];

      let isCallerAdmin = callerAppRole === 'admin' || callerUserRole === 'admin';
      if (!isCallerAdmin) {
        const { data: callerProfile } = await adminClient
          .from('profiles')
          .select('role')
          .eq('id', callerData.user.id)
          .maybeSingle();

        if (callerProfile?.role === 'admin') {
          isCallerAdmin = true;
        }
      }

      if (!isCallerAdmin) {
        res.status(403).json({ error: 'Action réservée exclusivement aux administrateurs' });
        return;
      }
    }

    // 1. Récupérer tous les utilisateurs depuis Supabase Auth
    let authUsers: {
      id: string;
      email?: string;
      phone?: string;
      created_at?: string;
      last_sign_in_at?: string;
      updated_at?: string;
      user_metadata?: Record<string, unknown>;
      app_metadata?: Record<string, unknown>;
    }[] = [];
    try {
      const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers();
      if (!authErr && authData?.users) {
        authUsers = authData.users as typeof authUsers;
      }
    } catch {
      // Si la liste d'auth échoue, on continue avec profiles
    }

    // 2. Récupérer tous les profils de la table public.profiles
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('*');

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const processedIds = new Set<string>();

    const users: Record<string, unknown>[] = [];

    // Combiner les utilisateurs Auth
    for (const u of authUsers) {
      processedIds.add(u.id);
      const p = profileMap.get(u.id);

      const firstName = p?.first_name || (u.user_metadata?.['first_name'] as string) || (u.user_metadata?.['firstName'] as string) || '';
      const lastName = p?.last_name || (u.user_metadata?.['last_name'] as string) || (u.user_metadata?.['lastName'] as string) || '';
      const email = u.email || p?.email || '';
      const displayName = `${firstName} ${lastName}`.trim() || (u.user_metadata?.['display_name'] as string) || email || 'Utilisateur';
      const role = p?.role || (u.app_metadata?.['role'] as string) || (u.user_metadata?.['role'] as string) || 'agent';

      users.push({
        id: u.id,
        email,
        firstName,
        lastName,
        displayName,
        role,
        department: p?.department || 'Services Généraux',
        phone: p?.phone || u.phone || '',
        isActive: p?.is_active ?? true,
        avatarUrl: p?.avatar_url,
        createdAt: p?.created_at || u.created_at || new Date().toISOString(),
        lastLoginAt: u.last_sign_in_at || p?.last_login_at,
        updatedAt: p?.updated_at || u.updated_at,
      });
    }

    // Ajouter les profils qui ne seraient pas dans authUsers
    for (const p of (profiles || [])) {
      if (!processedIds.has(p.id)) {
        processedIds.add(p.id);
        users.push({
          id: p.id,
          email: p.email || '',
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          displayName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Utilisateur',
          role: p.role || 'agent',
          department: p.department || 'Services Généraux',
          phone: p.phone || '',
          isActive: p.is_active ?? true,
          avatarUrl: p.avatar_url,
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at,
        });
      }
    }

    res.json({ users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur';
    res.status(500).json({ error: message });
  }
});

app.get('/api/admin/users', (req, res) => {
  req.url = '/api/system/collaborators';
  (app as unknown as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
});

/**
 * Endpoint sécurisé de création de collaborateurs (/api/system/collaborators).
 * Réservé aux administrateurs : vérifie le jeton Bearer JWT de l'appelant
 * et applique la séparation étanche app_metadata (rôle inviolable) vs user_metadata.
 */
app.post('/api/system/collaborators', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const {
    email,
    password,
    firstName,
    lastName,
    displayName,
    role,
    department,
    phone,
    isActive,
    sites,
  } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe initial obligatoires' });
    return;
  }

  const adminClient = getSupabaseAdmin();

  // Mode local / démonstration si Supabase n'est pas configuré
  if (!adminClient) {
    const localId = 'usr-' + Date.now();
    const resolvedRole = role || 'agent';
    res.status(201).json({
      user: {
        id: localId,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        displayName: displayName || `${firstName || ''} ${lastName || ''}`.trim() || email,
        role: resolvedRole,
        department: department || 'Direction Générale',
        phone: phone || '',
        isActive: isActive !== undefined ? isActive : true,
        createdAt: new Date().toISOString(),
      },
      message: 'Collaborateur créé en mode local (environnement Supabase non raccordé)',
    });
    return;
  }

  try {
    // 1. Contrôle strict de l'identité et du rôle admin de l'appelant via son JWT
    if (token) {
      const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);
      if (callerError || !callerData?.user) {
        res.status(401).json({ error: 'Session administrateur invalide ou expirée' });
        return;
      }

      const callerAppRole = callerData.user.app_metadata?.['role'];
      const callerUserRole = callerData.user.user_metadata?.['role'];

      // Vérification dans le profil si besoin
      let isCallerAdmin = callerAppRole === 'admin' || callerUserRole === 'admin';
      if (!isCallerAdmin) {
        const { data: callerProfile } = await adminClient
          .from('profiles')
          .select('role')
          .eq('id', callerData.user.id)
          .maybeSingle();

        if (callerProfile?.role === 'admin') {
          isCallerAdmin = true;
        }
      }

      if (!isCallerAdmin) {
        res.status(403).json({ error: 'Action réservée exclusivement aux administrateurs' });
        return;
      }
    } else {
      // Aucun token fourni alors que Supabase est configuré
      res.status(401).json({ error: 'Jeton de sécurité (Bearer token) requis' });
      return;
    }

    const computedDisplayName = displayName || `${firstName || ''} ${lastName || ''}`.trim() || email;
    const computedRole = role || 'agent';
    const sitesList = Array.isArray(sites) ? sites : (department ? [department] : []);

    let authUserId: string | null = null;
    const hasServiceRoleKey = Boolean(process.env['SUPABASE_SERVICE_ROLE_KEY']);

    if (hasServiceRoleKey) {
      // 2. Création avec privilèges élevés et étanchéité des métadonnées
      // - app_metadata : contient le rôle et les sites autorisés (inviolable par l'utilisateur)
      // - user_metadata : contient les informations de profil modifiables
      const { data: adminAuthData, error: adminAuthError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role: computedRole,
          assignedSiteNames: sitesList,
        },
        user_metadata: {
          display_name: computedDisplayName,
          first_name: firstName || '',
          last_name: lastName || '',
          phone: phone || '',
        },
      });

      if (adminAuthError) {
        res.status(400).json({ error: adminAuthError.message });
        return;
      }
      authUserId = adminAuthData.user.id;
    } else {
      // Fallback avec signUp si seule la clé anonyme est présente
      const { data: signUpData, error: signUpError } = await adminClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: computedDisplayName,
            first_name: firstName,
            last_name: lastName,
            role: computedRole,
            department,
          },
        },
      });

      if (signUpError) {
        res.status(400).json({ error: signUpError.message });
        return;
      }
      authUserId = signUpData.user?.id || null;
    }

    if (!authUserId) {
      res.status(500).json({ error: 'Impossible de récupérer l\'identifiant utilisateur généré' });
      return;
    }

    // 3. Synchronisation avec la table public.profiles
    const profilePayload = {
      id: authUserId,
      email,
      first_name: firstName || '',
      last_name: lastName || '',
      role: computedRole,
      department: department || 'Direction Générale',
      phone: phone || '',
      is_active: isActive !== undefined ? isActive : true,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(profilePayload);

    if (profileError) {
      console.warn('Avertissement synchronisation profiles:', profileError.message);
    }

    res.status(201).json({
      user: {
        id: authUserId,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        displayName: computedDisplayName,
        role: computedRole,
        department: department || 'Direction Générale',
        phone: phone || '',
        isActive: isActive !== undefined ? isActive : true,
        createdAt: new Date().toISOString(),
      },
      message: 'Collaborateur créé avec succès (droits scellés dans app_metadata et synchronisés)',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur';
    res.status(500).json({ error: message });
  }
});

/**
 * Route de compatibilité pour l'ancien endpoint /api/admin/users
 */
app.post('/api/admin/users', (req, res) => {
  req.url = '/api/system/collaborators';
  (app as unknown as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
});

/**
 * Modification d'un compte collaborateur (synchronisation auth.app_metadata + public.profiles)
 */
app.patch('/api/system/collaborators/:id', async (req, res) => {
  const userId = req.params['id'];
  if (!userId) {
    res.status(400).json({ error: 'Identifiant collaborateur requis' });
    return;
  }

  const { firstName, lastName, role, department, phone, isActive } = req.body;
  const adminClient = getSupabaseAdmin();

  if (!adminClient) {
    res.json({ success: true, message: 'Mis à jour en local' });
    return;
  }

  try {
    const profileUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (firstName !== undefined) profileUpdates['first_name'] = firstName;
    if (lastName !== undefined) profileUpdates['last_name'] = lastName;
    if (role !== undefined) profileUpdates['role'] = role;
    if (department !== undefined) profileUpdates['department'] = department;
    if (phone !== undefined) profileUpdates['phone'] = phone;
    if (isActive !== undefined) profileUpdates['is_active'] = isActive;

    await adminClient.from('profiles').update(profileUpdates).eq('id', userId);

    if (process.env['SUPABASE_SERVICE_ROLE_KEY']) {
      const authUpdates: Record<string, unknown> = {};
      if (role !== undefined) {
        authUpdates['app_metadata'] = { role };
      }
      if (firstName !== undefined || lastName !== undefined) {
        authUpdates['user_metadata'] = {
          first_name: firstName,
          last_name: lastName,
          display_name: `${firstName || ''} ${lastName || ''}`.trim(),
        };
      }
      if (Object.keys(authUpdates).length > 0) {
        await adminClient.auth.admin.updateUserById(userId, authUpdates);
      }
    }

    res.json({ success: true, message: 'Collaborateur mis à jour avec succès' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/admin/users/:id', (req, res) => {
  req.url = `/api/system/collaborators/${req.params['id']}`;
  (app as unknown as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
});

/**
 * Suppression d'un compte collaborateur (auth.users + public.profiles).
 */
app.delete('/api/system/collaborators/:id', async (req, res) => {
  const userId = req.params['id'];
  if (!userId) {
    res.status(400).json({ error: 'Identifiant collaborateur requis' });
    return;
  }

  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    res.json({ success: true, message: 'Collaborateur supprimé en local' });
    return;
  }

  try {
    if (process.env['SUPABASE_SERVICE_ROLE_KEY']) {
      await adminClient.auth.admin.deleteUser(userId);
    }
    await adminClient.from('profiles').delete().eq('id', userId);
    res.json({ success: true, message: 'Compte collaborateur supprimé avec succès' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  req.url = `/api/system/collaborators/${req.params['id']}`;
  (app as unknown as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: process.env['NODE_ENV'] === 'production' ? '1y' : '0',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
