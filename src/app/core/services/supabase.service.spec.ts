import { TestBed } from '@angular/core/testing';
import { InMemoryStorageAdapter, SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SupabaseService],
    });
    service = TestBed.inject(SupabaseService);
  });

  it('devrait être initialisé correctement', () => {
    expect(service).toBeTruthy();
  });

  it('devrait fournir un getter supabase sans erreur', () => {
    const client = service.supabase;
    // Le client est soit initialisé soit null de manière sécurisée
    expect(client !== undefined).toBe(true);
  });

  it('devrait évaluer isConfigured sous forme de signal booléen', () => {
    expect(typeof service.isConfigured()).toBe('boolean');
  });

  it('devrait utiliser InMemoryStorageAdapter pour isoler les données en mémoire vive (anti-XSS)', () => {
    const adapter = new InMemoryStorageAdapter();
    adapter.setItem('sb-test-token', 'jwt.secret.payload');
    expect(adapter.getItem('sb-test-token')).toBe('jwt.secret.payload');

    // Vérifier que localStorage n'est pas pollué
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('sb-test-token')).toBeNull();
    }

    adapter.removeItem('sb-test-token');
    expect(adapter.getItem('sb-test-token')).toBeNull();
  });
});

