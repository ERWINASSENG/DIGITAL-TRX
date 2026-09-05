import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardAdmin } from './dashboard-admin';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { UserProfile } from '../../../core/models/auth.model';

describe('DashboardAdmin', () => {
  let component: DashboardAdmin;
  let fixture: ComponentFixture<DashboardAdmin>;

  const mockAdminUser: UserProfile = {
    id: 'admin-1',
    email: 'admin@transimex.cm',
    firstName: 'Directeur',
    lastName: 'Général',
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const authServiceMock = {
    currentUser: signal(mockAdminUser),
    isAdmin: signal(true),
  };

  const userServiceMock = {
    users: signal([mockAdminUser]),
    totalUsersCount: signal(1),
    activeUsersCount: signal(1),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardAdmin],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardAdmin);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create dashboard admin component', () => {
    expect(component).toBeTruthy();
  });

  it('should format currency correctly in XAF', () => {
    const formatted = component.formatCurrency(1000000);
    expect(formatted).toContain('1');
    expect(formatted).toContain('000');
  });

  it('should provide department statistics and audit logs', () => {
    expect(component.departments().length).toBeGreaterThan(0);
    expect(component.auditLogs().length).toBeGreaterThan(0);
    expect(component.stats().totalTreasury).toBeGreaterThan(0);
  });
});
