import { ComponentFixture, TestBed } from '@angular/core/testing';

import  ListServices  from './list-services';

describe('ListServices', () => {
  let component: ListServices;
  let fixture: ComponentFixture<ListServices>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListServices]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListServices);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
