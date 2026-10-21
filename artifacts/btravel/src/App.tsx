import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
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
import AdminModulePage from '@/components/admin-module-page';
import { Home, TripsPage, AboutPage, VehiclesPage, TripDetail, TransportRequest, Contact, LegislationPage, TermsPage, ArchivePage, ProgrammePage, eventRoute } from '@/public/PublicSite';
import {
  useListPublicTrips, useGetPublicTrip, useGetDashboard, useListClients, useListQuoteRequests,
  useListQuotes, useListTransports, useListRecurringRoutes, useListVehicles, useListDrivers, useListAdminTrips,
  useListTripRequests, useListInvoices, useListTasks, useListDocuments, createQuoteRequest, createTripRequest,
  useCreateClient, useCreateTask, useCreateVehicle, useCreateDriver,
  getListClientsQueryKey, getListTasksQueryKey, getListVehiclesQueryKey, getListDriversQueryKey,
  getListQuoteRequestsQueryKey, getListQuotesQueryKey, getListTransportsQueryKey,
  getListRecurringRoutesQueryKey, getListAdminTripsQueryKey, getListTripRequestsQueryKey,
  getListInvoicesQueryKey, getListDocumentsQueryKey,
} from '@workspace/api-client-react';
import type { PublicTrip, QuoteRequestInput, TripRequestInput } from '@workspace/api-client-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });
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
const navGroups = [
  {name:'PILOTAGE', items:[['/admin','Vue d’ensemble','◫']]},
  {name:'RELATION CLIENT',items:[['/admin/demandes','Demandes de devis','↗'],['/admin/devis','Devis','▤'],['/admin/clients','Clients','♧']]},
  {name:'OPÉRATIONS',items:[['/admin/transports','Transports','⇄'],['/admin/trajets-recurrents','Trajets récurrents','↻'],['/admin/vehicules','Véhicules','▱'],['/admin/chauffeurs','Chauffeurs','♙']]},
  {name:'VOYAGES',items:[['/admin/voyages','Voyages publiés','⌁'],['/admin/inscriptions','Inscriptions','♧']]},
  {name:'GESTION',items:[['/admin/factures','Factures','▤'],['/admin/documents','Documents','▧'],['/admin/taches','Tâches','✓']]},
];
function AdminShell({children,title}:{children:ReactNode;title:string}) {
 const [open,setOpen]=useState(false); const [location]=useLocation(); const {user}=useUser();
 return <div className="admin-shell"><aside className={`sidebar ${open?'sidebar-open':''}`}><div className="side-brand"><Brand light/><button className="icon-button mobile-close" onClick={()=>setOpen(false)} aria-label="Fermer le menu"><X/></button></div><div className="side-tag">ESPACE ADMINISTRATEUR</div><nav>{navGroups.map(group=><div className="nav-group" key={group.name}><div className="nav-label">{group.name}</div>{group.items.map(([href,label,icon])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={`side-link ${location===href?'side-active':''}`}><span className="side-symbol">{icon}</span>{label}{href==='/admin/demandes'&&<span className="tiny-dot"/>}</Link>)}</div>)}</nav><div className="side-bottom"><div className="secure-mark"><ShieldCheck size={16}/><span>Accès sécurisé<br/><b>Session administrateur</b></span></div><Link href="/" className="site-link">← Retour au site public</Link></div></aside>{open&&<button className="mobile-scrim" onClick={()=>setOpen(false)} aria-label="Fermer le menu"/>}<section className="admin-main"><header className="admin-top"><button className="icon-button mobile-menu" onClick={()=>setOpen(true)} aria-label="Ouvrir le menu"><Menu/></button><div className="crumb">B-TRAVEL <span>/</span> {title}</div><div className="admin-user"><span className="user-avatar">{(user?.firstName || user?.primaryEmailAddress?.emailAddress || 'BT').slice(0,2).toUpperCase()}</span><span>{user?.firstName || 'Responsable'}<br/><small>Administration</small></span><SignOutButton/></div></header>{children}</section></div>;
}
function SignOutButton(){const {signOut}=useClerk();return <button type="button" className="logout-button" onClick={()=>signOut({redirectUrl:basePath||'/'})} aria-label="Se déconnecter"><LogOut size={16}/></button>}
function Dashboard() {
 const q=useGetDashboard();
 if(q.isLoading)return <AdminShell title="Vue d’ensemble"><div className="admin-content"><div className="dashboard-heading"><div className="loading-line"/></div><div className="metric-grid">{[1,2,3,4].map(i=><div className="metric-skeleton" key={i}/>)}</div></div></AdminShell>;
 if(q.isError&&[401,403].includes(errorStatus(q.error)))return <AdminShell title="Vue d’ensemble"><div className="admin-content"><AccessProblem status={errorStatus(q.error)}/></div></AdminShell>;
 if(q.isError||!q.data)return <AdminShell title="Vue d’ensemble"><div className="admin-content"><div className="error-panel"><CircleAlert/><div><b>Les données du tableau de bord sont indisponibles.</b><p>Vérifiez votre accès puis réessayez.</p><button className="button button-orange" onClick={()=>q.refetch()}>Réessayer</button></div></div></div></AdminShell>;
 const d=q.data;
  return <AdminShell title="Vue d’ensemble"><main className="admin-content"><div className="dashboard-heading"><div><div className="eyebrow">AUJOURD’HUI · ESPACE DE TRAVAIL</div><h1>Bonjour, <em>responsable.</em></h1><p>Voici les éléments qui demandent votre attention.</p></div><div className="date-stamp"><CalendarDays size={16}/>{new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</div></div><div className="metric-grid"><Metric title="Nouvelles demandes" value={d.newRequests} label="À examiner" icon={<FileText/>} color="orange" href="/admin/demandes"/><Metric title="Devis à suivre" value={d.quotesToFollow} label="En attente" icon={<Clock3/>} color="blue" href="/admin/devis"/><Metric title="Transports à venir" value={d.upcomingTransports} label="Planifiés" icon={<BusFront/>} color="sand" href="/admin/transports"/><Metric title="Inscriptions en attente" value={d.pendingTripRequests} label="Voyages" icon={<Users/>} color="green" href="/admin/inscriptions"/></div><div className="dashboard-lower"><section className="panel activity-panel"><div className="panel-head"><div><div className="eyebrow">EN DIRECT</div><h2>Activité récente</h2></div><span className="live-indicator"><i/> Connecté</span></div>{d.recentActivity.length?d.recentActivity.map(a=><div className="activity-row" key={a.id}><span className="activity-pin"/><div>{a.label}<small>{date(a.occurredAt)}</small></div><ArrowUpRight size={15}/></div>):<div className="empty-panel"><div className="empty-icon"><RefreshCw/></div><strong>Tout est calme pour le moment.</strong><span>Les nouvelles activités apparaîtront ici.</span></div>}</section><section className="panel tasks-panel"><div className="panel-head"><div><div className="eyebrow">À NE PAS OUBLIER</div><h2>Mes tâches</h2></div><Link href="/admin/taches" className="panel-more">Voir tout <ArrowRight size={14}/></Link></div>{d.tasks.length?d.tasks.map(t=><div className="task-row" key={t.id}><span className="task-box"/><div>{t.title}<small>{t.dueAt?date(t.dueAt):'Sans échéance'}</small></div></div>):<div className="empty-panel"><div className="empty-icon"><Check/></div><strong>Aucune tâche à afficher.</strong><span>Rien à cocher pour l’instant.</span><Link className="text-link" href="/admin/taches">Gérer les tâches <ArrowRight size={14}/></Link></div>}</section></div><div className="dashboard-footnote">Les montants, demandes et réservations sont issus des données de votre espace.</div></main></AdminShell>;
}
function Metric({title,value,label,icon,color,href}:{title:string;value:number;label:string;icon:ReactNode;color:string;href:string}){return <Link href={href} className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-title">{title}</span><ArrowUpRight className="metric-arrow" size={17}/></Link>}

type Row=Record<string,unknown>;
const modules:Record<string,{title:string;subtitle:string;columns:string[]}> = {
 '/admin/demandes':{title:'Demandes de devis',subtitle:'Les demandes de transport reçues depuis le site.',columns:['Référence','Contact','Trajet','Date','Passagers','Statut']},
 '/admin/devis':{title:'Devis',subtitle:'Suivi des propositions envoyées et à préparer.',columns:['Référence','Demande','Montant','Validité','Statut']},
 '/admin/clients':{title:'Clients',subtitle:'Coordonnées des clients enregistrés.',columns:['Nom','Organisation','E-mail','Téléphone','Créé le']},
 '/admin/transports':{title:'Transports',subtitle:'Planification et suivi des trajets confirmés.',columns:['Référence','Client','Trajet','Départ','Passagers','Statut']},
 '/admin/trajets-recurrents':{title:'Trajets récurrents',subtitle:'Récurrences et jours planifiés.',columns:['Nom','Jours','Période','Statut']},
 '/admin/vehicules':{title:'Véhicules',subtitle:'Parc et capacités disponibles.',columns:['Véhicule','Immatriculation','Capacité','Équipements','Statut']},
 '/admin/chauffeurs':{title:'Chauffeurs',subtitle:'Contacts de conduite.',columns:['Nom','Téléphone','E-mail','Statut']},
 '/admin/voyages':{title:'Voyages',subtitle:'Voyages publiés et brouillons.',columns:['Voyage','Destination','Départ','Prix','Places','Visibilité']},
  '/admin/inscriptions':{title:'Inscriptions',subtitle:'Demandes de places sur les voyages.',columns:['Voyage','Contact','Places','Montant','Réglé','Statut','Paiement']},
 '/admin/factures':{title:'Factures',subtitle:'Suivi manuel des factures et paiements.',columns:['Référence','Client','Montant','Réglé','Échéance','Statut']},
 '/admin/documents':{title:'Documents',subtitle:'Documents associés aux dossiers.',columns:['Nom','Dossier','Ajouté le']},
 '/admin/taches':{title:'Tâches',subtitle:'Suivi des actions de l’équipe.',columns:['Tâche','Catégorie','Échéance','État']},
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
 const [location]=useLocation();
 const tripMatch=location.match(/^\/voyages\/([^/]+)$/);
 return <RoutedErrorBoundary><Switch>
  <Route path="/" component={Home}/><Route path="/voyages" component={TripsPage}/>
  <Route path="/voyages-organises"><Redirect to="/voyages" replace/></Route>
  <Route path="/voyage"><Redirect to="/voyages" replace/></Route>
  <Route path="/etn"><Redirect to="/voyages" replace/></Route>
  <Route path="/categories/evenements-a-venir"><Redirect to="/voyages" replace/></Route>
  <Route path="/categories/evenements-passes"><Redirect to="/voyages#archives" replace/></Route>
  <Route path="/voyages/archives"><Redirect to="/voyages#archives" replace/></Route>
  <Route path="/devis"><Redirect to="/demande-de-transport" replace/></Route>
  <Route path="/devis-contact"><Redirect to="/demande-de-transport" replace/></Route>
  <Route path="/etn/:slug">{(p:{slug:string})=><Redirect to={eventRoute(p.slug)} replace/>}</Route>
  <Route path="/voyage/:slug">{(p:{slug:string})=><Redirect to={eventRoute(p.slug)} replace/>}</Route>
  <Route path="/voyages/archives/:slug">{(p:{slug:string})=><ArchivePage slug={p.slug}/>}</Route>
  <Route path="/voyages/programme/:slug">{(p:{slug:string})=><ProgrammePage slug={p.slug}/>}</Route>
  <Route path="/legislation" component={LegislationPage}/><Route path="/termes-et-conditions" component={TermsPage}/>
  <Route path="/a-propos" component={AboutPage}/><Route path="/nos-vehicules" component={VehiclesPage}/>
  {tripMatch&&<Route path={location}><TripDetail id={decodeURIComponent(tripMatch[1])}/></Route>}
  <Route path="/demande-de-transport" component={TransportRequest}/><Route path="/contact" component={Contact}/>
  <Route path="/admin"><RequireAdmin><Dashboard/></RequireAdmin></Route>
  {Object.entries(modules).map(([path,module])=><Route key={path} path={path}><RequireAdmin><AdminModulePage path={path} {...module} Shell={AdminShell}/></RequireAdmin></Route>)}
  <Route path="/sign-in/*?"><Redirect to="/admin" replace/></Route><Route path="/sign-up/*?" component={SignUpPage}/><Route component={NotFound}/>
 </Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkRouter/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;
