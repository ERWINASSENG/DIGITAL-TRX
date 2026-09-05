import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardEmployee } from './dashboard-employee';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfile } from '../../../core/models/auth.model';

describe('DashboardEmployee', () => {
  let component: DashboardEmployee;
  let fixture: ComponentFixture<DashboardEmployee>;

  const mockEmployeeUser: UserProfile = {
    id: 'emp-1',
    email: 'agent@transimex.cm',
    firstName: 'Jean',
    lastName: 'Kamga',
    role: 'agent',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const authServiceMock = {
    currentUser: signal(mockEmployeeUser),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardEmployee],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardEmployee);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create dashboard employee component', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle tasks completion state', () => {
    const targetTask = component.tasks()[0];
    const initialTaskState = targetTask.completed;

    component.toggleTask(targetTask.id);

    const updatedTask = component.tasks().find((t) => t.id === targetTask.id);
    expect(updatedTask?.completed).toBe(!initialTaskState);
  });
});
