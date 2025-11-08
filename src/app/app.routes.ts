import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import ListServices from './pages/list-services/list-services';
import  NewService  from './pages/new-service/new-service';
import  Register  from './pages/auth/register/register';
import Login from './pages/auth/login/login';
import UserInfo from './pages/user-info/user-info';
import MyServices from './pages/my-services/my-services';
import MessagesInbox from './pages/messages/messages';
import SearchUsers from './pages/search-users';
import PublicProfile from './pages/public-profile';
import ProviderBookings from './pages/provider-bookings';
import ClientBookings from './pages/client-bookings';
import GlobalSearch from './pages/global-search';
import ForgotPassword from './pages/auth/forgot-password';
import FavoritesPage from './pages/favorites';
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
    { path: 'mot-de-passe-oublie', component: ForgotPassword },
    { path: 'mes-services', component: MyServices, canActivate: [requireAuthGuard] },
    { path: 'mon-compte', component: UserInfo, canActivate: [requireAuthGuard] },
    { path: 'messagerie', component: MessagesInbox, canActivate: [requireAuthGuard] },
    {
        path: 'messagerie/:id',
        canActivate: [requireAuthGuard],
            loadComponent: () =>
                import('./pages/messages/conversation').then(c => c.default)
    },
    { path: 'mes-rendez-vous', component: ProviderBookings, canActivate: [requireAuthGuard] },
    { path: 'mes-reservations', component: ClientBookings, canActivate: [requireAuthGuard] },
    { path: 'favoris', component: FavoritesPage, canActivate: [requireAuthGuard] },
    { path: 'recherche', component: GlobalSearch },

    { path: 'prestataires', component: SearchUsers },
    { path: 'prestataires/:id', component: PublicProfile },
    {
        path: 'services/:id',
            loadComponent: () =>
                import('./pages/service-details/service-details').then(c => c.ServiceDetails)
    },
    {
        path: '**',
        loadComponent: () =>
            import('./pages/not-found/not-found').then(c => c.NotFoundComponent)
    },

];
