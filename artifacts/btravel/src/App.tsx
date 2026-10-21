import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Home, TripsPage, AboutPage, VehiclesPage, TripDetail, TransportRequest, Contact, LegislationPage, TermsPage, ArchivePage, ProgrammePage, eventRoute } from '@/public/PublicSite';

// L'administration (et Clerk) n'est chargée que sur /admin et les pages de connexion.
const AdminApp = lazy(() => import('@/AdminApp'));
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const isAdminPath = (path: string) => /^\/(admin|sign-in|sign-up)(\/|$)/.test(path);

function PublicRouter() {
  const [location] = useLocation();
  const tripMatch = location.match(/^\/voyages\/([^/]+)$/);
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={Home}/><Route path="/voyages" component={TripsPage}/>
    <Route path="/voyages-organises"><Redirect to="/voyages" replace/></Route>
    <Route path="/voyage"><Redirect to="/voyages" replace/></Route>
    <Route path="/etn"><Redirect to="/voyages" replace/></Route>
    <Route path="/categories/evenements-a-venir"><Redirect to="/voyages" replace/></Route>
    <Route path="/categories/evenements-passes"><Redirect to="/voyages#archives" replace/></Route>
    <Route path="/voyages/archives"><Redirect to="/voyages#archives" replace/></Route>
    <Route path="/devis"><Redirect to="/demande-de-transport" replace/></Route>
    <Route path="/devis-contact"><Redirect to="/demande-de-transport" replace/></Route>
    <Route path="/etn/:slug">{(p: { slug: string }) => <Redirect to={eventRoute(p.slug)} replace/>}</Route>
    <Route path="/voyage/:slug">{(p: { slug: string }) => <Redirect to={eventRoute(p.slug)} replace/>}</Route>
    <Route path="/voyages/archives/:slug">{(p: { slug: string }) => <ArchivePage slug={p.slug}/>}</Route>
    <Route path="/voyages/programme/:slug">{(p: { slug: string }) => <ProgrammePage slug={p.slug}/>}</Route>
    <Route path="/legislation" component={LegislationPage}/><Route path="/termes-et-conditions" component={TermsPage}/>
    <Route path="/a-propos" component={AboutPage}/><Route path="/nos-vehicules" component={VehiclesPage}/>
    {tripMatch && <Route path={location}><TripDetail id={decodeURIComponent(tripMatch[1])}/></Route>}
    <Route path="/demande-de-transport" component={TransportRequest}/><Route path="/contact" component={Contact}/>
    <Route component={NotFound}/>
  </Switch></ErrorBoundary>;
}

function Routes() {
  const [location] = useLocation();
  if (isAdminPath(location)) return <Suspense fallback={<main className="sign-in-placeholder"><div className="loading-panel"/></main>}><AdminApp/></Suspense>;
  return <PublicRouter/>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Routes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
