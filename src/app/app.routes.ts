import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import ListServices from './pages/list-services/list-services';
import  NewService  from './pages/new-service/new-service';
import  Register  from './pages/auth/register/register';
import Login from './pages/auth/login/login';

export const routes: Routes = [
    { path: '', component: Landing },
    { path: 'services', component: ListServices },
    { path: 'services/new', component: NewService },
    {
  path: 'login', component : Login
},
{
  path: 'register',component :Register
},

    {
        path: 'services/:id',
            loadComponent: () =>
                import('./pages/service-details/service-details').then(c => c.ServiceDetails)
    },

];
