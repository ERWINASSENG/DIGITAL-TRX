import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    role: 'manager_stock',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const authServiceMock = {
    currentUser: signal(mockManagerUser),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardManager],
      providers: [
        provideRouter([]),
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

  it('should allow approving pending requests', () => {
    const initialCount = component.pendingCount();
    expect(initialCount).toBeGreaterThan(0);

    const firstReqId = component.pendingRequests()[0].id;
    component.approveRequest(firstReqId);

    const updated = component.pendingRequests().find((r) => r.id === firstReqId);
    expect(updated?.status).toBe('approved');
    expect(component.pendingCount()).toBe(initialCount - 1);
  });

  it('should allow rejecting pending requests', () => {
    const firstReqId = component.pendingRequests()[0].id;
    component.rejectRequest(firstReqId);

    const updated = component.pendingRequests().find((r) => r.id === firstReqId);
    expect(updated?.status).toBe('rejected');
  });
});
