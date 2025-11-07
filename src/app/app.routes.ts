import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import ListServices from './pages/list-services/list-services';
import  NewService  from './pages/new-service/new-service';
import  Register  from './pages/auth/register/register';
import Login from './pages/auth/login/login';
import UserInfo from './pages/user-info/user-info';
import MyServices from './pages/my-services/my-services';
import MessagesInbox from './pages/messages/messages';
import { requireAuthGuard } from './core/store/auth.guard';

export const routes: Routes = [
    { path: '', component: Landing },
    { path: 'services', component: ListServices },
    { path: 'services/new', component: NewService, canActivate: [requireAuthGuard] },
    { path: 'services/:id/edit', component: NewService, canActivate: [requireAuthGuard] },
    {
  path: 'login', component : Login
},
{
  path: 'register',component :Register
},
    { path: 'mes-services', component: MyServices, canActivate: [requireAuthGuard] },
    { path: 'mon-compte', component: UserInfo, canActivate: [requireAuthGuard] },
    { path: 'messagerie', component: MessagesInbox, canActivate: [requireAuthGuard] },
    {
        path: 'messagerie/:id',
        canActivate: [requireAuthGuard],
            loadComponent: () =>
                import('./pages/messages/conversation').then(c => c.default)
    },

    {
        path: 'services/:id',
            loadComponent: () =>
                import('./pages/service-details/service-details').then(c => c.ServiceDetails)
    },

];
