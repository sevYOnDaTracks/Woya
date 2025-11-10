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
import GlobalSearch from './pages/global-search';
import ForgotPassword from './pages/auth/forgot-password';
import FavoritesPage from './pages/favorites';
import NotificationsPage from './pages/messages/notifications';
import DashboardPage from './pages/dashboard';
import AgendaPage from './pages/agenda';
import { requireAuthGuard } from './core/store/auth.guard';
import AdminLogin from './pages/admin-login';
import AdminDashboard from './pages/admin-dashboard';
import { requireAdminGuard } from './core/store/admin.guard';

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
    { path: 'mon-espace', component: DashboardPage, canActivate: [requireAuthGuard] },
    { path: 'mes-services', component: MyServices, canActivate: [requireAuthGuard] },
    { path: 'agenda', component: AgendaPage, canActivate: [requireAuthGuard] },
    { path: 'mon-compte', redirectTo: 'mon-compte/photos', pathMatch: 'full' },
    { path: 'mon-compte/:section', component: UserInfo, canActivate: [requireAuthGuard] },
    { path: 'messagerie', component: MessagesInbox, canActivate: [requireAuthGuard] },
    {
        path: 'messagerie/:id',
        canActivate: [requireAuthGuard],
            loadComponent: () =>
                import('./pages/messages/conversation').then(c => c.default)
    },
    { path: 'notifications', component: NotificationsPage, canActivate: [requireAuthGuard] },
    { path: 'mes-rendez-vous', redirectTo: 'agenda?tab=provider', pathMatch: 'full' },
    { path: 'mes-reservations', redirectTo: 'agenda?tab=client', pathMatch: 'full' },
    { path: 'favoris', component: FavoritesPage, canActivate: [requireAuthGuard] },
    { path: 'recherche', component: GlobalSearch },
    {
        path: 'admin',
        children: [
            { path: '', component: AdminLogin },
            { path: 'panel', component: AdminDashboard, canActivate: [requireAdminGuard] },
        ],
    },

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
