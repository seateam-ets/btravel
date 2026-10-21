import { type ComponentType, type ReactNode, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, UserButton, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { frFR } from '@clerk/localizations';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BusFront, CalendarDays, Check, ChevronDown, CircleAlert, Clock3, FileText, LogOut, MapPin, Menu, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
const AdminModulePage = lazy(() => import('@/components/admin-module-page'));
import {
  useListPublicTrips, useGetPublicTrip, useGetDashboard, useListClients, useListQuoteRequests,
  useListQuotes, useListTransports, useListRecurringRoutes, useListVehicles, useListDrivers, useListAdminTrips,
  useListTripRequests, useListInvoices, useListScheduleOccurrences, useListTasks, useListDocuments, createQuoteRequest, createTripRequest,
  useCreateClient, useCreateTask, useCreateVehicle, useCreateDriver,
  getListClientsQueryKey, getListTasksQueryKey, getListVehiclesQueryKey, getListDriversQueryKey,
  getListQuoteRequestsQueryKey, getListQuotesQueryKey, getListTransportsQueryKey,
  getListRecurringRoutesQueryKey, getListAdminTripsQueryKey, getListTripRequestsQueryKey,
  getListInvoicesQueryKey, getListDocumentsQueryKey,
} from '@workspace/api-client-react';
import type { PublicTrip, QuoteRequestInput, TripRequestInput } from '@workspace/api-client-react';

const money = (cents?: number) => cents == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
const date = (value?: string) => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/btravel-logo.png`,
  },
  variables: {
    colorPrimary: '#365899',
    colorForeground: '#18344d',
    colorMutedForeground: '#64748b',
    colorDanger: '#b42318',
    colorBackground: '#fffdf8',
    colorInput: '#ffffff',
    colorInputForeground: '#18344d',
    colorNeutral: '#dedbd4',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: { width: '440px', maxWidth: '100%', background: '#fffdf8', borderRadius: '18px', overflow: 'hidden' },
    card: { boxShadow: 'none', border: 'none', background: 'transparent' },
    footer: { boxShadow: 'none', border: 'none', background: 'transparent' },
    headerTitle: { color: '#18344d', fontFamily: 'Space Grotesk, sans-serif' },
    headerSubtitle: { color: '#536577' },
    socialButtonsBlockButtonText: { color: '#18344d' },
    formFieldLabel: { color: '#18344d' },
    footerActionLink: { color: '#365899' },
    footerActionText: { color: '#536577' },
    dividerText: { color: '#536577' },
    identityPreviewEditButton: { color: '#365899' },
    formFieldSuccessText: { color: '#18794e' },
    alertText: { color: '#18344d' },
    logoBox: { display: 'flex' },
    logoImage: { maxHeight: '40px' },
    socialButtonsBlockButton: { borderColor: '#dedbd4', color: '#18344d' },
    formButtonPrimary: { background: '#365899', color: '#ffffff' },
    formFieldInput: { borderColor: '#dedbd4', color: '#18344d', background: '#ffffff' },
    footerAction: { display: 'none' },
    dividerLine: { background: '#dedbd4' },
    alert: { background: '#fff4e5' },
    otpCodeFieldInput: { borderColor: '#dedbd4', color: '#18344d' },
    formFieldRow: { color: '#18344d' },
    main: { color: '#18344d' },
  },
} as const;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="B-TRAVEL — accueil"><img src="/btravel-logo.png" alt="B-TRAVEL" /></Link>;
}
// Les 6 rubriques du cahier des charges, plus Paramètres.
const navGroups: { name: string; items: [string, string, string][] }[] = [
  {name:'Accueil', items:[['/admin','Tableau de bord','◫'],['/admin/taches','Rappels et tâches','✓']]},
  {name:'Demandes et devis', items:[['/admin/demandes','Demandes','↗'],['/admin/devis','Devis','▤']]},
  {name:'Planning des trajets', items:[['/admin/transports','Planning','⇄'],['/admin/trajets-recurrents','Trajets réguliers','↻']]},
  {name:'Clients', items:[['/admin/clients','Clients','♧'],['/admin/documents','Documents','▧']]},
  {name:'Facturation', items:[['/admin/factures','Factures','€']]},
  {name:'Voyages organisés', items:[['/admin/voyages','Voyages','⌁'],['/admin/inscriptions','Inscriptions','✎']]},
  {name:'Paramètres', items:[['/admin/vehicules','Autocars','▱'],['/admin/chauffeurs','Chauffeurs','♙']]},
];
export const sectionOf = (path: string) => navGroups.find(g => g.items.some(([href]) => href === path))?.name ?? 'Accueil';

function GlobalSearch() {
  const [term, setTerm] = useState(''); const [open, setOpen] = useState(false); const [, navigate] = useLocation();
  const enabled = term.trim().length >= 2;
  const clients = useListClients(undefined, { query: { enabled, queryKey: getListClientsQueryKey() } });
  const requests = useListQuoteRequests(undefined, { query: { enabled, queryKey: getListQuoteRequestsQueryKey() } });
  const quotes = useListQuotes({ query: { enabled, queryKey: getListQuotesQueryKey() } });
  const invoices = useListInvoices({ query: { enabled, queryKey: getListInvoicesQueryKey() } });
  const results = useMemo(() => {
    if (!enabled) return [];
    const q = term.trim().toLowerCase();
    const hit = (v: unknown) => JSON.stringify(v).toLowerCase().includes(q);
    const out: { kind: string; label: string; detail: string; href: string }[] = [];
    (clients.data ?? []).filter(hit).slice(0, 4).forEach(c => out.push({ kind: 'Client', label: c.name, detail: [c.organizationName, c.phone].filter(Boolean).join(' · '), href: '/admin/clients' }));
    (requests.data ?? []).filter(hit).slice(0, 4).forEach(r => out.push({ kind: 'Demande', label: `${r.contactName} · ${r.destination}`, detail: date(r.departureAt), href: '/admin/demandes' }));
    (quotes.data ?? []).filter(hit).slice(0, 3).forEach(r => out.push({ kind: 'Devis', label: `${r.clientName ?? r.reference}`, detail: money(r.totalCents), href: '/admin/devis' }));
    (invoices.data ?? []).filter(hit).slice(0, 3).forEach(r => out.push({ kind: 'Facture', label: `${r.clientName} · ${r.reference}`, detail: money(r.totalCents), href: '/admin/factures' }));
    return out;
  }, [enabled, term, clients.data, requests.data, quotes.data, invoices.data]);
  const go = (href: string) => { setOpen(false); navigate(`${href}?q=${encodeURIComponent(term.trim())}`); setTerm(''); };
  return <div className="global-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
    <Search size={18}/>
    <input value={term} onChange={e => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Rechercher un client, une demande, une facture…" aria-label="Recherche rapide" onKeyDown={e => { if (e.key === 'Enter' && results[0]) go(results[0].href); if (e.key === 'Escape') setOpen(false); }}/>
    {open && enabled && <div className="global-search-results" role="listbox">
      {results.length ? results.map((r, i) => <button key={i} type="button" onClick={() => go(r.href)}><span className="status-tag">{r.kind}</span><span><b>{r.label}</b><small>{r.detail}</small></span></button>)
        : <p>{clients.isLoading || requests.isLoading ? 'Recherche…' : 'Aucun résultat.'}</p>}
    </div>}
  </div>;
}

function AdminShell({children,title}:{children:ReactNode;title:string}) {
 const [open,setOpen]=useState(false); const [location]=useLocation(); const {user}=useUser();
 const name = user?.firstName || 'Responsable';
 useEffect(()=>{ document.title = `${title} · Administration B-TRAVEL`; },[title]);
 return <div className="admin-shell"><aside className={`sidebar ${open?'sidebar-open':''}`}>
  <div className="side-brand"><Brand light/><button className="icon-button mobile-close" onClick={()=>setOpen(false)} aria-label="Fermer le menu"><X/></button></div>
  <nav aria-label="Menu de l’administration">{navGroups.map(group=><div className="nav-group" key={group.name}><div className="nav-label">{group.name}</div>{group.items.map(([href,label,icon])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={`side-link ${location===href?'side-active':''}`} aria-current={location===href?'page':undefined}><span className="side-symbol" aria-hidden>{icon}</span>{label}</Link>)}</div>)}</nav>
  <div className="side-bottom"><Link href="/" className="site-link">← Voir le site public</Link></div>
 </aside>{open&&<button className="mobile-scrim" onClick={()=>setOpen(false)} aria-label="Fermer le menu"/>}
 <section className="admin-main"><header className="admin-top"><button className="icon-button mobile-menu" onClick={()=>setOpen(true)} aria-label="Ouvrir le menu"><Menu/></button><GlobalSearch/><div className="admin-user"><span className="user-avatar" aria-hidden>{name.slice(0,2).toUpperCase()}</span><span className="admin-user-name">{name}</span><SignOutButton/></div></header>
 <Suspense fallback={<main className="admin-content"><div className="table-skeleton">{[1,2,3].map(i=><div key={i}/>)}</div></main>}>{children}</Suspense></section></div>;
}
function SignOutButton(){const {signOut}=useClerk();return <button type="button" className="logout-button" onClick={()=>signOut({redirectUrl:basePath||'/'})} aria-label="Se déconnecter"><LogOut size={16}/><span>Déconnexion</span></button>}
const longDay = (value?: string) => value ? new Intl.DateTimeFormat('fr-BE',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Brussels'}).format(new Date(value)) : '—';
const isoDay = (offset = 0) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels'}).format(new Date(Date.now()+offset*864e5));
function UpcomingTransports() {
 const range = { from: isoDay(0), to: isoDay(7) };
 const q = useListScheduleOccurrences(range, { query: { queryKey: ['dashboard-upcoming', range.from] } });
 const items = (q.data ?? []).slice(0, 6);
 return <section className="panel"><div className="panel-head"><div><div className="eyebrow">Les 7 prochains jours</div><h2>Prochains transports</h2></div><Link href="/admin/transports" className="panel-more">Planning complet <ArrowRight size={14}/></Link></div>
  {q.isLoading ? <div className="loading-line"/> : items.length ? items.map(t => <Link href="/admin/transports" className="upcoming-row" key={t.id}><span className="upcoming-when">{longDay(t.startAt)}</span><span><b>{t.title}</b><small>{t.pickupAddress} → {t.destination} · {t.passengerCount} passagers</small></span><ArrowUpRight size={16}/></Link>)
   : <div className="empty-panel"><div className="empty-icon"><BusFront/></div><strong>Aucun transport prévu cette semaine.</strong><Link className="text-link" href="/admin/transports?nouveau=1">Planifier un transport <ArrowRight size={14}/></Link></div>}
 </section>;
}
function Dashboard() {
 const q=useGetDashboard(); const {user}=useUser();
 const greeting = `Bonjour${user?.firstName ? `, ${user.firstName}` : ''}.`;
 if(q.isLoading)return <AdminShell title="Tableau de bord"><div className="admin-content"><div className="dashboard-heading"><div className="loading-line"/></div><div className="metric-grid">{[1,2,3,4].map(i=><div className="metric-skeleton" key={i}/>)}</div></div></AdminShell>;
 if(q.isError&&[401,403].includes(errorStatus(q.error)))return <AdminShell title="Tableau de bord"><div className="admin-content"><AccessProblem status={errorStatus(q.error)}/></div></AdminShell>;
 if(q.isError||!q.data)return <AdminShell title="Tableau de bord"><div className="admin-content"><div className="error-panel"><CircleAlert/><div><b>Le tableau de bord ne s’affiche pas.</b><p>Vérifiez votre connexion internet puis réessayez.</p><button className="button button-orange" onClick={()=>q.refetch()}>Réessayer</button></div></div></div></AdminShell>;
 const d=q.data;
 return <AdminShell title="Tableau de bord"><main className="admin-content">
  <div className="dashboard-heading"><div><div className="eyebrow">{new Intl.DateTimeFormat('fr-BE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())}</div><h1>{greeting}</h1><p>Voici ce qui demande votre attention aujourd’hui.</p></div></div>
  <div className="quick-actions" aria-label="Actions rapides">
   <Link href="/admin/demandes?nouveau=1" className="quick-action"><Plus size={20}/><span><b>Nouvelle demande</b><small>Après un appel téléphonique</small></span></Link>
   <Link href="/admin/devis?nouveau=1" className="quick-action"><FileText size={20}/><span><b>Nouveau devis</b><small>À partir d’une demande</small></span></Link>
   <Link href="/admin/transports?nouveau=1" className="quick-action"><BusFront size={20}/><span><b>Nouveau transport</b><small>Ajouter au planning</small></span></Link>
  </div>
  <div className="metric-grid metric-grid-5">
   <Metric title="Nouvelles demandes" value={d.newRequests} label="À examiner" icon={<FileText/>} color="orange" href="/admin/demandes"/>
   <Metric title="Devis à relancer" value={d.quotesToFollow} label="En attente de réponse" icon={<Clock3/>} color="blue" href="/admin/devis"/>
   <Metric title="Transports à venir" value={d.upcomingTransports} label="Planifiés" icon={<BusFront/>} color="sand" href="/admin/transports"/>
   <Metric title="Inscriptions à confirmer" value={d.pendingTripRequests} label="Voyages" icon={<Users/>} color="green" href="/admin/inscriptions"/>
   <Metric title="Factures à encaisser" value={money(d.unpaidInvoicesCents)} label="Reste à payer" icon={<FileText/>} color="sand" href="/admin/factures"/>
  </div>
  <div className="dashboard-lower"><UpcomingTransports/>
   <section className="panel tasks-panel"><div className="panel-head"><div><div className="eyebrow">À ne pas oublier</div><h2>Rappels et tâches</h2></div><Link href="/admin/taches" className="panel-more">Tout voir <ArrowRight size={14}/></Link></div>{d.tasks.length?d.tasks.map(t=><div className="task-row" key={t.id}><span className="task-box"/><div>{t.title}<small>{t.dueAt?longDay(t.dueAt):'Sans échéance'}</small></div></div>):<div className="empty-panel"><div className="empty-icon"><Check/></div><strong>Aucun rappel pour le moment.</strong><Link className="text-link" href="/admin/taches?nouveau=1">Ajouter un rappel <ArrowRight size={14}/></Link></div>}</section>
  </div>
  <section className="panel activity-panel"><div className="panel-head"><div><div className="eyebrow">Historique</div><h2>Dernières actions</h2></div></div>{d.recentActivity.length?d.recentActivity.slice(0,6).map(a=><div className="activity-row" key={a.id}><span className="activity-pin"/><div>{a.label.replace(/\b(DMD|DEV|TR|BT)-[0-9A-Z-]+/g,'').replace(/\s*:\s*$/,'').trim()}<small>{longDay(a.occurredAt)}</small></div></div>):<div className="empty-panel"><strong>Aucune action récente.</strong></div>}</section>
 </main></AdminShell>;
}
function Metric({title,value,label,icon,color,href}:{title:string;value:number|string;label:string;icon:ReactNode;color:string;href:string}){return <Link href={href} className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-title">{title}</span><ArrowUpRight className="metric-arrow" size={17}/></Link>}

type Row=Record<string,unknown>;
const modules:Record<string,{title:string;subtitle:string;columns:string[]}> = {
 '/admin/demandes':{title:'Demandes',subtitle:'Les demandes reçues par le site ou ajoutées après un appel.',columns:['Contact','Trajet','Date','Passagers','Statut','Référence']},
 '/admin/devis':{title:'Devis',subtitle:'Les devis préparés, envoyés et acceptés.',columns:['Demande','Montant','Validité','Statut','Référence']},
 '/admin/clients':{title:'Clients',subtitle:'Coordonnées et historique de vos clients.',columns:['Nom','Organisation','E-mail','Téléphone','Créé le']},
 '/admin/transports':{title:'Planning',subtitle:'Les transports par jour, semaine ou mois.',columns:['Client','Trajet','Départ','Passagers','Statut','Référence']},
 '/admin/trajets-recurrents':{title:'Trajets réguliers',subtitle:'Les trajets répétés chaque semaine, hors congés scolaires.',columns:['Nom','Jours','Période','Statut']},
 '/admin/vehicules':{title:'Autocars',subtitle:'Vos autocars, leurs places et leurs disponibilités.',columns:['Véhicule','Immatriculation','Capacité','Équipements','Statut']},
 '/admin/chauffeurs':{title:'Chauffeurs',subtitle:'Coordonnées et disponibilités des chauffeurs.',columns:['Nom','Téléphone','E-mail','Statut']},
 '/admin/voyages':{title:'Voyages',subtitle:'Les voyages organisés. Un voyage « Publié » apparaît sur le site.',columns:['Voyage','Destination','Départ','Prix','Places','Visibilité']},
 '/admin/inscriptions':{title:'Inscriptions',subtitle:'Les demandes de places pour vos voyages.',columns:['Voyage','Contact','Places','Montant','Réglé','Statut','Paiement']},
 '/admin/factures':{title:'Factures',subtitle:'Factures, acomptes et paiements reçus.',columns:['Client','Montant','Réglé','Échéance','Statut','Référence']},
 '/admin/documents':{title:'Documents',subtitle:'Devis, contrats et documents liés à vos clients.',columns:['Nom','Dossier','Ajouté le']},
 '/admin/taches':{title:'Rappels et tâches',subtitle:'Devis à relancer, clients à rappeler, transports à préparer.',columns:['Tâche','Catégorie','Échéance','État']},
};
function useModuleData(path:string) {
 const clients=useListClients(undefined,{query:{enabled:path==='/admin/clients',queryKey:getListClientsQueryKey()}});
 const requests=useListQuoteRequests(undefined,{query:{enabled:path==='/admin/demandes',queryKey:getListQuoteRequestsQueryKey()}});
 const quotes=useListQuotes({query:{enabled:path==='/admin/devis',queryKey:getListQuotesQueryKey()}});
 const transports=useListTransports(undefined,{query:{enabled:path==='/admin/transports',queryKey:getListTransportsQueryKey()}});
 const recurring=useListRecurringRoutes({query:{enabled:path==='/admin/trajets-recurrents',queryKey:getListRecurringRoutesQueryKey()}});
 const vehicles=useListVehicles({query:{enabled:path==='/admin/vehicules',queryKey:getListVehiclesQueryKey()}});
 const drivers=useListDrivers({query:{enabled:path==='/admin/chauffeurs',queryKey:getListDriversQueryKey()}});
 const trips=useListAdminTrips({query:{enabled:path==='/admin/voyages',queryKey:getListAdminTripsQueryKey()}});
 const bookings=useListTripRequests({query:{enabled:path==='/admin/inscriptions',queryKey:getListTripRequestsQueryKey()}});
 const invoices=useListInvoices({query:{enabled:path==='/admin/factures',queryKey:getListInvoicesQueryKey()}});
 const docs=useListDocuments({query:{enabled:path==='/admin/documents',queryKey:getListDocumentsQueryKey()}});
 const tasks=useListTasks({query:{enabled:path==='/admin/taches',queryKey:getListTasksQueryKey()}});
 const match:Record<string,{data?:Row[];loading:boolean;error:boolean;refetch:()=>void}>={
 '/admin/demandes':{data:requests.data as unknown as Row[],loading:requests.isLoading,error:requests.isError,refetch:()=>requests.refetch()},
 '/admin/devis':{data:quotes.data as unknown as Row[],loading:quotes.isLoading,error:quotes.isError,refetch:()=>quotes.refetch()},
 '/admin/clients':{data:clients.data as unknown as Row[],loading:clients.isLoading,error:clients.isError,refetch:()=>clients.refetch()},
 '/admin/transports':{data:transports.data as unknown as Row[],loading:transports.isLoading,error:transports.isError,refetch:()=>transports.refetch()},
 '/admin/trajets-recurrents':{data:recurring.data as unknown as Row[],loading:recurring.isLoading,error:recurring.isError,refetch:()=>recurring.refetch()},
 '/admin/vehicules':{data:vehicles.data as unknown as Row[],loading:vehicles.isLoading,error:vehicles.isError,refetch:()=>vehicles.refetch()},
 '/admin/chauffeurs':{data:drivers.data as unknown as Row[],loading:drivers.isLoading,error:drivers.isError,refetch:()=>drivers.refetch()},
 '/admin/voyages':{data:trips.data as unknown as Row[],loading:trips.isLoading,error:trips.isError,refetch:()=>trips.refetch()},
 '/admin/inscriptions':{data:bookings.data as unknown as Row[],loading:bookings.isLoading,error:bookings.isError,refetch:()=>bookings.refetch()},
 '/admin/factures':{data:invoices.data as unknown as Row[],loading:invoices.isLoading,error:invoices.isError,refetch:()=>invoices.refetch()},
 '/admin/documents':{data:docs.data as unknown as Row[],loading:docs.isLoading,error:docs.isError,refetch:()=>docs.refetch()},
 '/admin/taches':{data:tasks.data as unknown as Row[],loading:tasks.isLoading,error:tasks.isError,refetch:()=>tasks.refetch()},
 };
 return match[path];
}
function displayCell(row:Row,path:string,column:string):string {
 const get=(key:string)=>row[key];
 const frenchStatus=(value:unknown)=>({new:'Nouvelle',processing:'En cours',quoted:'Devis envoyé',closed:'Clôturée',draft:'Brouillon',sent:'Envoyé',accepted:'Accepté',declined:'Refusé',expired:'Expiré',planned:'Planifié',confirmed:'Confirmé',completed:'Terminé',cancelled:'Annulé',pending:'En attente',unpaid:'À régler',partial:'Partiel',paid:'Réglé',published:'Publié',archived:'Archivé',active:'Actif',inactive:'Inactif',partially_paid:'Partiellement réglée',true:'Actif',false:'Inactif'} as Record<string,string>)[String(value)]||String(value);
 if(column==='Référence')return String(get('reference')||'—');
 if(column==='Contact')return `${get('contactName')||''} · ${get('email')||''}`;
 if(column==='Trajet')return `${get('pickupAddress')||''} → ${get('destination')||''}`;
 if(column==='Date'||column==='Départ'||column==='Créé le'||column==='Ajouté le'||column==='Échéance'||column==='Validité')return date(String(get(({ 'Date':'departureAt','Départ':path.includes('voyages')?'startDate':path.includes('transports')?'startAt':'departureAt','Créé le':'createdAt','Ajouté le':'createdAt','Échéance':'dueDate','Validité':'validUntil'} as Record<string,string>)[column])||''));
 if(column==='Passagers')return String(get(path.includes('inscriptions')?'seatCount':'passengerCount')??'—');
 if(column==='Montant')return money(Number(get('totalCents')));
 if(column==='Réglé')return money(Number(get('paidCents')));
 if(column==='Prix')return money(Number(get('priceCents')));
 if(column==='Places')return String(get(path.includes('inscriptions')?'seatCount':'remainingSeats')??'—');
 if(column==='Statut'||column==='État'||column==='Paiement'||column==='Visibilité')return frenchStatus(get(({ 'Statut':path.includes('demandes')?'status':path.includes('transports')?'status':path.includes('inscriptions')?'status':path.includes('devis')?'status':'active','État':'completed','Paiement':'paymentState','Visibilité':'visibility'} as Record<string,string>)[column])??'—');
 const mapping:Record<string,string>={'Nom':'name','Organisation':'organizationName','E-mail':'email','Téléphone':'phone','Client':'clientName','Demande':'requestId','Destination':'destination','Véhicule':'name','Immatriculation':'registration','Capacité':'capacity','Équipements':'equipment','Jours':'weekdays','Période':'startDate','Voyage':'title','Tâche':'title','Catégorie':'category','Dossier':'entityType'};
 if(column==='Période')return `${date(String(get('startDate')))} – ${date(String(get('endDate')))}`;
 if(column==='Jours')return Array.isArray(get('weekdays'))?String((get('weekdays') as number[]).join(', ')):'—';
 if(column==='Équipements')return Array.isArray(get('equipment'))?(get('equipment') as string[]).join(', ')||'—':'—';
 if(column==='Trajet'&&path.includes('transports'))return `${get('pickupAddress')} → ${get('destination')}`;
 return String(get(mapping[column]||column)||'—');
}
function ModulePage({path}:{path:string}) {
 const m=modules[path];const query=useModuleData(path);const [search,setSearch]=useState('');const [showForm,setShowForm]=useState(false);
 const clientsMutation=useCreateClient();const taskMutation=useCreateTask();const vehicleMutation=useCreateVehicle();const driverMutation=useCreateDriver();const qc=useQueryClient();
 const canCreate=['/admin/clients','/admin/taches','/admin/vehicules','/admin/chauffeurs'].includes(path);
 const createSubmit=(f:FormData)=>{
  if(path==='/admin/clients')clientsMutation.mutate({data:{name:String(f.get('name')),organizationName:String(f.get('organization')||''),email:String(f.get('email')),phone:String(f.get('phone')),address:String(f.get('address')||'')}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListClientsQueryKey()});setShowForm(false)}});
  if(path==='/admin/taches')taskMutation.mutate({data:{title:String(f.get('title')),category:String(f.get('category')||''),dueAt:String(f.get('due')||'')}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListTasksQueryKey()});setShowForm(false)}});
  if(path==='/admin/vehicules')vehicleMutation.mutate({data:{name:String(f.get('name')),registration:String(f.get('registration')),capacity:Number(f.get('capacity')),equipment:String(f.get('equipment')||'').split(',').map(s=>s.trim()).filter(Boolean)}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListVehiclesQueryKey()});setShowForm(false)}});
  if(path==='/admin/chauffeurs')driverMutation.mutate({data:{name:String(f.get('name')),phone:String(f.get('phone')),email:String(f.get('email')||'')}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListDriversQueryKey()});setShowForm(false)}});
 };
 const pending=clientsMutation.isPending||taskMutation.isPending||vehicleMutation.isPending||driverMutation.isPending;
 const failure=clientsMutation.isError||taskMutation.isError||vehicleMutation.isError||driverMutation.isError;
 const rows=(query?.data||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 return <AdminShell title={m.title}><main className="admin-content module-content"><div className="module-title-row"><div><div className="eyebrow">ESPACE DE GESTION</div><h1>{m.title}</h1><p>{m.subtitle}</p></div>{canCreate&&<button className="button button-orange" onClick={()=>setShowForm(!showForm)}><Plus size={16}/>{showForm?'Fermer':'Ajouter'}</button>}</div>
 {path==='/admin/factures'&&<div className="blocked-banner"><ShieldCheck/><div><strong>Émission de factures désactivée</strong><span>La création et l’émission restent indisponibles tant que les règles comptables ne sont pas approuvées.</span></div></div>}
 {showForm&&<form className="inline-create" onSubmit={e=>{e.preventDefault();createSubmit(new FormData(e.currentTarget));}}><div className="form-grid">{path==='/admin/clients'?<><label>Nom<input name="name" required/></label><label>Organisation<input name="organization"/></label><label>E-mail<input name="email" type="email" required/></label><label>Téléphone<input name="phone" required minLength={6}/></label><label className="span-all">Adresse<input name="address"/></label></>:path==='/admin/taches'?<><label>Tâche<input name="title" required/></label><label>Catégorie<input name="category"/></label><label>Échéance<input type="date" name="due"/></label></>:path==='/admin/vehicules'?<><label>Nom<input name="name" required/></label><label>Immatriculation<input name="registration" required/></label><label>Capacité<input name="capacity" type="number" min="1" required/></label><label>Équipements <span className="optional">séparés par des virgules</span><input name="equipment"/></label></>:<><label>Nom<input name="name" required/></label><label>Téléphone<input name="phone" required minLength={6}/></label><label>E-mail<input name="email" type="email"/></label></>}</div><div className="form-footer"><button className="button button-orange" disabled={pending}>{pending?'Enregistrement…':'Enregistrer'}</button><button type="button" className="button button-outline" onClick={()=>setShowForm(false)}>Annuler</button>{failure&&<span className="form-error">Enregistrement impossible. Réessayez.</span>}</div></form>}
 <div className="table-tools"><label className="search-field"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher dans la liste"/></label><span>{query?.data?.length??0} résultat{query?.data?.length===1?'':'s'}</span></div>
 {query?.loading?<div className="table-skeleton">{[1,2,3,4].map(i=><div key={i}/>)}</div>:query?.error?<div className="error-panel"><CircleAlert/><div><b>Impossible de charger ces données.</b><p>Votre session est peut-être expirée ou l’API est momentanément indisponible.</p><button className="button button-orange" onClick={query.refetch}>Réessayer</button></div></div>:!rows.length?<div className="empty-table"><div className="empty-icon"><FileText/></div><strong>{search?'Aucun résultat pour cette recherche.':'Aucune donnée pour le moment.'}</strong><span>{search?'Essayez un autre terme.':'Les enregistrements apparaîtront ici une fois créés.'}</span>{canCreate&&!search&&<button className="text-link" onClick={()=>setShowForm(true)}>Ajouter un élément <ArrowRight size={14}/></button>}</div>:<div className="table-wrap"><table><thead><tr>{m.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id||i)}>{m.columns.map((col,j)=><td key={col} className={j===0?'strong-cell':''}>{col==='Statut'||col==='État'||col==='Paiement'||col==='Visibilité'?<span className={`status-tag status-${displayCell(row,path,col).toLowerCase().replaceAll('_','-')}`}>{displayCell(row,path,col)}</span>:displayCell(row,path,col)}</td>)}</tr>)}</tbody></table></div>}
 </main></AdminShell>;
}
function useClerkErrorWatcher(){
 const ref=useRef<HTMLDivElement>(null); const [failed,setFailed]=useState(false);
 useEffect(()=>{
  const node=ref.current; if(!node)return;
  const check=()=>setFailed(!!node.querySelector('.cl-formFieldErrorText, .cl-alert, [id$="-error"]'));
  const observer=new MutationObserver(check); observer.observe(node,{childList:true,subtree:true}); check();
  return()=>observer.disconnect();
 },[]);
 return {ref,failed};
}
function SignInPage(){
 const {ref,failed}=useClerkErrorWatcher();
 return <main className="sign-in-placeholder"><Brand/><div className="sign-in-card"><div className="eyebrow">ESPACE B-TRAVEL</div><h1>Administration</h1><p>Connectez-vous avec votre adresse e-mail et votre mot de passe.</p>
  {failed&&<div className="signin-help signin-help-alert" role="alert"><CircleAlert size={18}/><div><strong>La connexion n’a pas abouti.</strong><span>Si c’est votre première visite, vous devez d’abord créer votre compte avec l’adresse e-mail autorisée.</span><Link href="/sign-up" className="button button-orange">Créer mon compte</Link></div></div>}
  <div ref={ref}><SignIn routing="hash" signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/admin`} appearance={clerkAppearance}/></div>
  <div className="signin-help"><div><strong>Pas encore de compte ?</strong><span>Créez votre accès en deux minutes avec l’adresse e-mail autorisée par B-TRAVEL.</span><Link href="/sign-up" className="button button-outline">Créer mon compte</Link></div></div>
  <Link href="/" className="text-link">← Retour au site public</Link></div></main>;
}
function AccessProblem({status,detail}:{status:number;detail?:string}){
 const {signOut}=useClerk(); const {user}=useUser();
 if(status===401)return <div className="error-panel"><CircleAlert/><div><b>Votre session a expiré.</b><p>Reconnectez-vous pour continuer. Si vous n’avez pas encore de compte, créez-le d’abord.</p><div className="access-actions"><Link href="/admin" className="button button-orange">Me reconnecter</Link><Link href="/sign-up" className="button button-outline">Créer mon compte</Link></div></div></div>;
 return <div className="error-panel"><CircleAlert/><div><b>Ce compte n’a pas accès à l’administration.</b><p>Vous êtes connectée avec <strong>{user?.primaryEmailAddress?.emailAddress??'une adresse non autorisée'}</strong>. Seules les adresses autorisées par B-TRAVEL peuvent entrer.</p>{detail&&<p className="access-detail"><strong>Raison :</strong> {detail}</p>}<div className="access-actions"><button className="button button-orange" onClick={()=>signOut({redirectUrl:`${basePath}/sign-up`})}>Créer un compte avec une autre adresse</button><button className="button button-outline" onClick={()=>signOut({redirectUrl:`${basePath}/admin`})}>Changer de compte</button></div></div></div>;
}
const errorDetail=(error:unknown)=>{const data=(error as {data?:{error?:unknown}}|null)?.data;return typeof data?.error==='string'?data.error:undefined;};
const errorStatus=(error:unknown)=>typeof error==='object'&&error!==null&&'status' in error?Number((error as {status:unknown}).status):0;
function SignUpPage(){return <main className="sign-in-placeholder"><Brand/><div className="sign-in-card"><div className="eyebrow">ESPACE B-TRAVEL</div><h1>Première connexion</h1><p>Créez votre accès avec l’adresse e-mail autorisée par B-TRAVEL. Les autres adresses n’ont pas accès à l’administration.</p><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/admin`} forceRedirectUrl={`${basePath}/admin`} appearance={clerkAppearance}/><Link href="/admin" className="text-link">J’ai déjà un accès, me connecter</Link></div></main>}
function RequireAdmin({children}:{children:ReactNode}){
 const {isLoaded,isSignedIn}=useAuth(); const [path]=useLocation();
 if(!isLoaded)return <main className="sign-in-placeholder"><div className="loading-panel"/></main>;
 if(!isSignedIn)return path==='/admin'?<SignInPage/>:<Redirect to="/admin"/>;
 return <AccessGate>{children}</AccessGate>;
}
// Vérifie une seule fois que le compte connecté est bien autorisé avant d'afficher une page admin.
function AccessGate({children}:{children:ReactNode}){
 const q=useGetDashboard();
 const status=q.isError?errorStatus(q.error):0;
 if(q.isLoading)return <main className="sign-in-placeholder"><div className="loading-panel"/></main>;
 if(status===401||status===403)return <main className="sign-in-placeholder"><Brand/><div className="sign-in-card"><AccessProblem status={status} detail={errorDetail(q.error)}/></div></main>;
 return <>{children}</>;
}
function ClerkQueryClientCacheInvalidator(){
 const {addListener}=useClerk();const client=useQueryClient();const previousUser=useRef<string|null|undefined>(undefined);
 useEffect(()=>addListener(({user})=>{const userId=user?.id??null;if(previousUser.current!==undefined&&previousUser.current!==userId)client.clear();previousUser.current=userId;}),[addListener,client]);
 return null;
}
function ClerkRouter(){
 const [,setLocation]=useLocation();
 return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/admin`} signUpUrl={`${basePath}/sign-up`} localization={frFR} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}><ClerkQueryClientCacheInvalidator/><Router/></ClerkProvider>;
}
function Router(){
 return <RoutedErrorBoundary><Switch>
  <Route path="/admin"><RequireAdmin><Dashboard/></RequireAdmin></Route>
  {Object.entries(modules).map(([path,module])=><Route key={path} path={path}><RequireAdmin><AdminModulePage path={path} {...module} Shell={AdminShell}/></RequireAdmin></Route>)}
  <Route path="/sign-in/*?"><Redirect to="/admin" replace/></Route><Route path="/sign-up/*?" component={SignUpPage}/><Route component={NotFound}/>
 </Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>}
export default function AdminApp(){return <ClerkRouter/>}
