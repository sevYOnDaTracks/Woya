import { ComponentFixture, TestBed } from '@angular/core/testing';

import  NewService  from './new-service';

describe('NewService', () => {
  let component: NewService;
  let fixture: ComponentFixture<NewService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewService]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewService);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
