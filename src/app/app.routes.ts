import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import ListServices from './pages/list-services/list-services';
import  NewService  from './pages/new-service/new-service';

export const routes: Routes = [
    { path: '', component: Landing },
    { path: 'services', component: ListServices },
    { path: 'services/new', component: NewService },
];
