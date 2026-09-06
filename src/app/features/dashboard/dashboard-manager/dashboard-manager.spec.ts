import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DashboardManager } from './dashboard-manager';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfile } from '../../../core/models/auth.model';

describe('DashboardManager', () => {
  let component: DashboardManager;
  let fixture: ComponentFixture<DashboardManager>;

  const mockManagerUser: UserProfile = {
    id: 'manager-1',
    email: 'manager@transimex.cm',
    firstName: 'Paul',
    lastName: 'Ewane',
    role: 'manager',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const currentUserSignal = signal<UserProfile | null>(mockManagerUser);

  const authServiceMock = {
    currentUser: currentUserSignal,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardManager],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardManager);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create dashboard manager component', () => {
    expect(component).toBeTruthy();
  });

  it('should expose the current user signal', () => {
    expect(component.currentUser()).toEqual(mockManagerUser);
  });

  it('should handle state when user is null gracefully', () => {
    currentUserSignal.set(null);
    fixture.detectChanges();
    expect(component.currentUser()).toBeNull();
  });
});

