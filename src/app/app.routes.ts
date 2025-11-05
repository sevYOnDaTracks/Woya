import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import ListServices from './pages/list-services/list-services';

export const routes: Routes = [
    { path: '', component: Landing },
    { path: 'services', component: ListServices },
];
