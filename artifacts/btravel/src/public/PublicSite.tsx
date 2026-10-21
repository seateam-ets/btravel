import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, Redirect, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, ArrowUpRight, Briefcase, BusFront, CalendarDays, Check, CircleAlert, Globe2, GraduationCap, Mail, MapPin, Menu, Phone, RefreshCw, ShieldCheck, Star, Ticket, Users, X } from 'lucide-react';
import { useListPublicTrips, useGetPublicTrip, createTripRequest } from '@workspace/api-client-react';
import type { PublicTrip, TripRequestInput } from '@workspace/api-client-react';
import { categoryForPassengers, fleetCategories, transportTypes } from './fleet';
import { QuoteForm } from './QuoteForm';
import { ContactForm } from './ContactForm';
import content from '@/content/site-content.json';
import './scout-public.css';

/* ---------- helpers ---------- */
const money = (cents?: number) => cents == null ? '' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
const date = (value?: string) => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '';
const A = content.address;
const PHONE_HREF = 'tel:+3210650201';
const events = content.events.map(event => ({
  ...event,
  title: event.title.replace(/\s+[–—]\s+/g, ', '),
}));
const upcomingEvent = events.find(e => e.upcoming);
const pastEvents = events.filter(e => !e.upcoming);
const pageMd = (part: string) => content.pages.find(p => p.url.includes(part))?.markdown ?? '';
const isCologne = (t: PublicTrip) =>
  t.startDate.slice(0, 10) === upcomingEvent?.date &&
  /cologne|k[oö]ln/i.test(`${t.title} ${t.destination}`);
export function eventRoute(slug: string) {
  const ev = events.find(e => e.slug === slug || e.legacySlug === slug);
  if (!ev) return '/voyages';
  return ev.upcoming ? `/voyages/programme/${ev.slug}` : `/voyages/archives/${ev.slug}`;
}
const longDate = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));


/* ---------- tiny markdown renderer for sourced content ---------- */
function inline(raw: string, key = 'i'): ReactNode[] {
  const s = raw.replace(/\\([+|.\-_*[\]])/g, '$1');
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|_[^_\s][^_]*_)/g;
  let last = 0; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0]; const k = `${key}-${n++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = lm?.[2] ?? '#';
      out.push(<a key={k} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{inline(lm?.[1] ?? '', k)}</a>);
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map(part => typeof part === 'string' ? part.replace(/info@b-travel\.be/g, 'info@b-travel.be') : part);
}
function SourceMarkdown({ md, skip = [] }: { md: string; skip?: RegExp[] }) {
  const lines = md.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { const items = list; blocks.push(<ul key={`u${blocks.length}`}>{items.map((l, i) => <li key={i}>{inline(l, `l${blocks.length}${i}`)}</li>)}</ul>); list = []; } };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('![') || line.startsWith('[Aller au contenu') || line.startsWith('{') || skip.some(r => r.test(line))) { if (!line) flush(); continue; }
    if (/^[-*] /.test(line) && line !== '* * *') { list.push(line.slice(2)); continue; }
    flush();
    if (line === '* * *') { blocks.push(<hr key={`h${blocks.length}`} />); continue; }
    const h = line.match(/^(#{2,6})\s+(.*)$/);
    if (h) { const k = `t${blocks.length}`; blocks.push(h[1].length <= 3 ? <h3 key={k}>{inline(h[2], k)}</h3> : <h4 key={k}>{inline(h[2], k)}</h4>); continue; }
    blocks.push(<p key={`p${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="sc-prose">{blocks}</div>;
}

/* ---------- motion ---------- */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.public-site .rv:not(.in)'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  });
}

/* ---------- chrome ---------- */
const navLinks: [string, string][] = [['/#services', 'Services'], ['/nos-vehicules', 'Nos véhicules'], ['/voyages', 'Voyages'], ['/a-propos', 'À propos de nous'], ['/contact', 'Contact']];
function PublicNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [overPhoto, setOverPhoto] = useState(true);
  const [location] = useLocation();
  useEffect(() => {
    // Transparent seulement si la page commence par une grande photo.
    setOverPhoto(!!document.querySelector('.sc-site main > section:first-child:is(.sc-hero, .sc-pagehero)'));
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > 320 && y > last + 4);
      if (y < last - 4) setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  useEffect(() => setOpen(false), [location]);
  const close = () => setOpen(false);
  const solid = scrolled || open || !overPhoto;
  const isActive = (href: string) => !href.includes('#') && location.startsWith(href);
  return <header className={`sc-nav2${solid ? ' is-solid' : ''}${hidden && !open ? ' is-hidden' : ''}${open ? ' is-open' : ''}`}>
    <div className="sc-nav2-bar">
      <Link href="/" className="sc-nav2-logo" aria-label="B-TRAVEL, accueil" onClick={close}><img src="/btravel-logo.png" alt="B-TRAVEL" /></Link>
      <nav className="sc-nav2-links" aria-label="Navigation principale">{navLinks.map(([h, l]) => <a key={h} href={h} onClick={close} className={isActive(h) ? 'is-active' : ''}>{l}</a>)}</nav>
      <div className="sc-nav2-actions">
        <a href={PHONE_HREF} className="sc-nav2-phone" aria-label={`Appeler le ${A.phone}`} title={A.phone}><Phone size={16} /><span>{A.phone}</span></a>
        <Link href="/demande-de-transport" className="sc-nav2-cta" onClick={close}>Demander un devis</Link>
        <button className="sc-nav2-burger" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={open} onClick={() => setOpen(v => !v)}><span /><span /></button>
      </div>
    </div>
    <div className="sc-nav2-overlay" hidden={!open}>
      <nav aria-label="Menu mobile">{navLinks.map(([h, l], i) => <a key={h} href={h} onClick={close} style={{ animationDelay: `${i * 50}ms` }}>{l}<ArrowUpRight size={22} /></a>)}</nav>
      <div className="sc-nav2-overlay-foot">
        <Link href="/demande-de-transport" className="sc-btn sc-btn-sig sc-full" onClick={close}>Demander un devis <ArrowRight size={16} /></Link>
        <a href={PHONE_HREF} className="sc-btn sc-btn-outline sc-full"><Phone size={15} /> {A.phone}</a>
        <a href={`mailto:${A.email}`} className="sc-nav2-mail">{A.email}</a>
      </div>
    </div>
  </header>;
}
function Footer() {
  return <footer className="sc-footer">
    <div className="sc-footer-top">
      <div><img src="/btravel-logo.png" alt="B-TRAVEL" className="sc-footer-logo" /><p>Entreprise familiale de transport de passagers en autocar. Flotte basée à Perwez, Brabant wallon.</p></div>
      <div><span className="sc-mono">Exploitation</span><p>{A.operating}</p><span className="sc-mono">Siège social</span><p>{A.registered}</p></div>
      <div><span className="sc-mono">Contact</span><p><a href={PHONE_HREF}>Tél. {A.phone}</a><br />Fax {A.fax}<br /><a href={`mailto:${A.email}`}>{A.email}</a><br />TVA {A.vat}</p></div>
      <div className="sc-footer-links"><span className="sc-mono">Plan du site</span><Link href="/voyages">Voyages</Link><Link href="/nos-vehicules">Nos véhicules</Link><Link href="/a-propos">À propos de nous</Link><Link href="/demande-de-transport">Demande de transport</Link><Link href="/legislation">Législation</Link><Link href="/termes-et-conditions">Termes et conditions</Link><a href={content.facebook} target="_blank" rel="noreferrer">Facebook</a><Link href="/admin">Administration</Link></div>
    </div>
    <div className="sc-footer-bar"><span>© B-TRAVEL</span><span className="sc-mono">Perwez · BE</span><span className="sc-mono">Depuis plus de 40 ans</span></div>
  </footer>;
}
const SITE = 'B-TRAVEL';
function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : `${SITE} · Autocars avec chauffeur à Perwez, Brabant wallon`;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
function PublicLayout({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  usePageMeta(title, description);
  useReveal();
  return <div className="public-site sc-site"><PublicNav />{children}<Footer /></div>;
}
function PageHero({ image, kicker, title, meta, children, cutout }: { image?: string; kicker: string; title: ReactNode; meta?: string[]; children?: ReactNode; cutout?: string }) {
  if (!image) return <section className="sc-pagehero-light">
    <div className="sc-pagehero-light-copy"><span className="sc-mono">{kicker}</span><h1>{title}</h1>{children}
      {meta && <ul className="sc-pagehero-chips">{meta.map(m => <li key={m}>{m}</li>)}</ul>}</div>
    {cutout && <img src={cutout} alt="" className="sc-pagehero-cutout" />}
  </section>;
  return <section className="sc-pagehero">
    <img src={image} alt="" className="sc-hero-img" />
    <div className="sc-hero-shade" />
    <div className="sc-pagehero-copy"><span className="sc-mono">{kicker}</span><h1>{title}</h1>{children}{meta && <ul className="sc-pagehero-chips sc-pagehero-chips-dark">{meta.map(m => <li key={m}>{m}</li>)}</ul>}</div>
  </section>;
}
function Kicker({ n, children }: { n: string; children: ReactNode }) { return <div className="sc-kicker"><span>{n}</span><i />{children}</div>; }

/* ---------- trip cards (API) ---------- */
function TripCards({ trips, loading, error, retry, limit = 3 }: { trips: PublicTrip[]; loading: boolean; error: boolean; retry: () => void; limit?: number }) {
  if (loading) return <div className="sc-cards">{[1, 2, 3].map(n => <div className="sc-skel" key={n} />)}</div>;
  if (error) return <div className="sc-state"><CircleAlert /><span>Les voyages ne sont pas disponibles pour le moment.</span><button className="sc-textlink" onClick={retry}>Réessayer <RefreshCw size={15} /></button></div>;
  if (!trips.length) return null;
  return <div className="sc-cards">{trips.slice(0, limit).map((trip, i) => <Link href={`/voyages/${trip.id}`} className="sc-card rv" key={trip.id} data-testid={`card-trip-${trip.id}`}>
    <div className="sc-card-img"><img src={trip.imageUrl || content.heroImage} alt="" loading="lazy" /><span className="sc-chip">{String(i + 1).padStart(2, '0')} · Départ</span></div>
    <div className="sc-card-body"><span className="sc-mono">{date(trip.startDate)} au {date(trip.endDate)}</span><h3>{trip.title}</h3><div className="sc-card-foot"><span>{trip.destination} · {trip.remainingSeats} places restantes</span><b>{money(trip.priceCents)}<small> / pers.</small></b></div></div>
  </Link>)}</div>;
}
function AnnouncementCard() {
  if (!upcomingEvent) return null;
  return <Link href={`/voyages/programme/${upcomingEvent.slug}`} className="sc-announce rv">
    <div className="sc-announce-img"><img src={upcomingEvent.image} alt="Marché de Noël de Cologne" loading="lazy" /></div>
    <div className="sc-announce-body">
      <span className="sc-chip sc-chip-solid">Annonce · inscription sur demande</span>
      <h3>{upcomingEvent.title}</h3>
      <dl><div><dt>Prix</dt><dd>50 € / pers.</dd></div><div><dt>Départs</dt><dd>Perwez 7h00 · Wavre 7h20 · Flagey 8h00</dd></div><div><dt>Inclus</dt><dd>Transport A/R et petit-déjeuner</dd></div></dl>
      <span className="sc-textlink">Voir le programme <ArrowRight size={15} /></span>
    </div>
  </Link>;
}
const cleanTitle = (t: string) => t.replace(/^(COMPLET|NOUVELLE DATE)\s*!\s*/i, '').trim();
function ArchiveGrid() {
  const [all, setAll] = useState(false);
  const shown = all ? pastEvents : pastEvents.slice(0, 3);
  return <><div className="sc-archive">{shown.map((e, i) => <Link key={e.slug} href={`/voyages/archives/${e.slug}`} className="sc-arch rv" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
    <div className="sc-arch-img"><img src={e.image} alt="" loading="lazy" /><span className="sc-chip">Voyage passé</span></div>
    <span className="sc-mono">{longDate(e.date)} · {e.priceLabel}</span><h3>{cleanTitle(e.title)}</h3><span className="sc-textlink">Lire l’archive <ArrowUpRight size={14} /></span>
  </Link>)}</div>
  {pastEvents.length > 3 && <button className="sc-btn sc-btn-outline sc-archive-more" onClick={() => setAll(v => !v)} aria-expanded={all}>{all ? 'Afficher moins' : `Voir les ${pastEvents.length} voyages passés`}</button>}</>;
}

/* ---------- Home ---------- */
const services = [
  { icon: GraduationCap, title: 'Écoles', text: 'Sorties scolaires, classes vertes, musées et trajets réguliers, avec des chauffeurs habitués aux enfants.', type: 'Sortie scolaire' },
  { icon: Users, title: 'Groupes et associations', text: 'Clubs sportifs, mouvements de jeunesse, seniors : un autocar adapté à la taille de votre groupe.', type: 'Excursion de groupe' },
  { icon: Briefcase, title: 'Entreprises', text: 'Séminaires, team buildings, transferts de personnel ou de clients, en Belgique et à l’étranger.', type: 'Transport d’entreprise' },
  { icon: Ticket, title: 'Événements et navettes', text: 'Mariages, festivals, salons : des navettes fiables, à l’heure, pour tous vos invités.', type: 'Navette événement' },
  { icon: Globe2, title: 'Voyages à l’étranger', text: 'Séjours de plusieurs jours en France, aux Pays-Bas, en Allemagne et partout en Europe.', type: 'Voyage à l’étranger' },
  { icon: MapPin, title: 'Excursions organisées', text: 'Marchés de Noël, parcs d’attractions, city trips : rejoignez nos voyages au départ de Perwez.', href: '/voyages' },
];

function ExpressQuote() {
  const [, navigate] = useLocation();
  return <form className="sc-bookbar" aria-label="Devis rapide" onSubmit={e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    for (const [key, value] of f.entries()) if (String(value).trim()) q.set(key, String(value));
    navigate(`/demande-de-transport${q.size ? `?${q}` : ''}`);
  }}>
    <label className="sc-bookbar-field"><span>Transport</span><select name="type" defaultValue=""><option value="">Type de trajet</option>{transportTypes.map(t => <option key={t.value}>{t.value}</option>)}</select></label>
    <label className="sc-bookbar-field"><span>Destination</span><input name="destination" placeholder="Où allez-vous ?" /></label>
    <label className="sc-bookbar-field"><span>Date</span><input name="date" type="date" /></label>
    <label className="sc-bookbar-field sc-bookbar-pax"><span>Passagers</span><input name="passagers" type="number" min={1} max={999} inputMode="numeric" placeholder="45" /></label>
    <button className="sc-btn sc-btn-dark">Obtenir un devis <ArrowRight size={16} /></button>
  </form>;
}

export function FleetChooser() {
  const [passengers, setPassengers] = useState(45);
  const [selected, setSelected] = useState(() => categoryForPassengers(45).id);
  const [model, setModel] = useState(0);
  const category = fleetCategories.find(c => c.id === selected) ?? fleetCategories[0];
  const recommended = categoryForPassengers(passengers).id;
  const pick = (id: string) => { setSelected(id); setModel(0); };
  const onPassengers = (value: number) => { const n = Math.max(1, Math.min(83, value || 1)); setPassengers(n); pick(categoryForPassengers(n).id); };
  const current = category.models[model] ?? category.models[0];
  const quoteHref = `/demande-de-transport?passagers=${passengers}&vehicule=${encodeURIComponent(`${category.name} (${current.name})`)}`;
  return <div className="sc-chooser">
    <div className="sc-chooser-size">
      <label htmlFor="pax"><span className="sc-mono">Combien êtes-vous ?</span><strong><output>{passengers}</output> passagers</strong></label>
      <input id="pax" type="range" min={1} max={83} value={passengers} onChange={e => onPassengers(Number(e.target.value))} aria-valuetext={`${passengers} passagers`} />
      <div className="sc-chooser-scale sc-mono"><span>1</span><span>20</span><span>35</span><span>60</span><span>83</span></div>
    </div>
    <div className="sc-chooser-tabs" role="tablist" aria-label="Catégories de véhicules">
      {fleetCategories.map(c => <button key={c.id} role="tab" aria-selected={c.id === selected} className={`${c.id === selected ? 'is-on' : ''}`} onClick={() => pick(c.id)}>
        <strong>{c.name}</strong><span>{c.seats}</span>{c.id === recommended && <em>Conseillé</em>}
      </button>)}
    </div>
    <div className="sc-chooser-panel" role="tabpanel">
      <div className="sc-chooser-media">
        <img key={current.image} src={current.image} alt={`${current.name}, ${category.name} B-TRAVEL`} />
        <span className="sc-chip">{current.name}</span>
        {category.models.length > 1 && <div className="sc-chooser-thumbs">{category.models.map((m, i) => <button key={m.name} className={i === model ? 'is-on' : ''} onClick={() => setModel(i)} aria-label={`Voir ${m.name}`}><img src={m.image} alt="" loading="lazy" /></button>)}</div>}
      </div>
      <div className="sc-chooser-info">
        <span className="sc-mono">{category.usage}</span>
        <h3>{category.name}<small>{category.seats}</small></h3>
        <p>{category.description}</p>
        <ul>{category.highlights.map(h => <li key={h}><Check size={16} />{h}</li>)}</ul>
        <p className="sc-chooser-models"><b>Modèles :</b> {category.models.map(m => m.name).join(' · ')}</p>
        <Link href={quoteHref} className="sc-btn sc-btn-dark">Demander un devis pour {passengers} passagers <ArrowRight size={16} /></Link>
        <small className="sc-chooser-note">Capacités indicatives selon le modèle ; la capacité exacte est confirmée dans votre devis.</small>
      </div>
    </div>
  </div>;
}

export function Home() {
  const trips = useListPublicTrips();
  const list = trips.data ?? [];
  const hasApiCologne = list.some(isCologne);
  const reviews = content.reviews;
  return <PublicLayout><main>
    <section className="sc-hero sc-hero-v3">
      <img src={content.heroImage} alt="Intérieur d’un autocar B-TRAVEL" className="sc-hero-img sc-kenburns" />
      <div className="sc-hero-shade sc-hero-shade-v3" />
      <div className="sc-hero3-copy">
        <h1 className="sc-fade" style={{ animationDelay: '.25s' }}>Voyagez ensemble,<br />on s’occupe de la route.</h1>
        <p className="sc-fade" style={{ animationDelay: '.4s' }}>Autocars avec chauffeur pour les écoles, les groupes, les entreprises et les voyages en Europe, depuis plus de 40 ans.</p>
        <div className="sc-hero-actions sc-fade" style={{ animationDelay: '.55s' }}>
          <a href="#flotte" className="sc-btn sc-btn-light">Découvrir nos autocars</a>
          <Link href="/voyages" className="sc-btn sc-btn-ghost">Voyages organisés</Link>
        </div>
      </div>
      <div className="sc-hero3-bottom sc-fade" style={{ animationDelay: '.7s' }}><ExpressQuote /></div>
    </section>

    <section className="sc-why" id="pourquoi">
      <div><Kicker n="01">Pourquoi B-TRAVEL</Kicker><h2 className="rv">Sécurité et confort, depuis plus de 40 ans.</h2></div>
      <ul>
        <li className="rv"><ShieldCheck /><b>Sécurité d’abord</b><span>Véhicules entretenus et équipés des dernières technologies de sécurité ; chauffeurs respectant la réglementation sur les temps de conduite.</span></li>
        <li className="rv"><Users /><b>Une entreprise familiale</b><span>Un interlocuteur direct qui connaît votre dossier, de la demande de devis au retour du groupe.</span></li>
        <li className="rv"><BusFront /><b>Une flotte variée</b><span>Du minibus au double étage de 83 places : le véhicule adapté, sans payer de places inutiles.</span></li>
        <li className="rv"><MapPin /><b>Ancrés en Brabant wallon</b><span>Dépôt à Perwez, départs depuis votre école, votre entreprise ou le lieu de votre choix.</span></li>
      </ul>
      <ul className="sc-monogram-stats sc-why-stats">
        <li><strong>40+</strong><span>ans d’expérience</span></li>
        <li><strong>13</strong><span>modèles d’autocars</span></li>
        <li><strong>83</strong><span>places au maximum</span></li>
        <li><strong>16</strong><span>avis Google « Excellent »</span></li>
      </ul>
    </section>

    <section className="sc-monogram" id="flotte">
      <Kicker n="02">Nos autocars</Kicker>
      <p className="sc-monogram-word rv" aria-hidden="true">B-TRAVEL</p>
      <img className="sc-monogram-bus rv" src={fleetCategories.find(c => c.id === 'double')?.models[0].image ?? content.fleet[1].image} alt="Autocar double étage Néoplan Skyliner B-TRAVEL" loading="lazy" />
      <div className="sc-monogram-copy rv">
        <h2>Du minibus au double étage.</h2>
        <p>Treize modèles entretenus à Perwez, jusqu’à 83 places, pour emmener chaque groupe en toute sécurité.</p>
        <div className="sc-monogram-actions"><a href="#choisir" className="sc-btn sc-btn-dark">Choisir mon autocar</a><Link href="/nos-vehicules" className="sc-btn sc-btn-pale">Voir la flotte</Link></div>
      </div>
    </section>

    <section className="sc-fleetzone" id="choisir">
      <div className="sc-head sc-head-light"><div><h2 className="rv">Indiquez la taille de votre groupe, nous vous conseillons le bon véhicule.</h2></div><Link href="/nos-vehicules" className="sc-textlink">Toute la flotte <ArrowRight size={15} /></Link></div>
      <FleetChooser />
    </section>

    <section className="sc-who" id="qui-sommes-nous">
      <div className="sc-who-media rv">
        <img src={content.teamImage} alt="L’équipe B-TRAVEL devant un autocar, au dépôt de Perwez" loading="lazy" />
        <img src={content.depotImage} alt="Le dépôt B-TRAVEL à Perwez, vu du ciel" loading="lazy" />
      </div>
      <div className="sc-who-copy">
        <Kicker n="03">Qui sommes-nous ?</Kicker>
        <h2 className="rv">Une entreprise familiale, sur la route depuis plus de 40 ans.</h2>
        <p className="rv">Active depuis plus de 40 ans, <b>B-TRAVEL</b> est une société familiale spécialisée dans le transport de personnes en autocars. Le parc des véhicules se situe à Perwez, dans la province du Brabant wallon.</p>
        <p className="rv">Écoles, entreprises, associations et groupes : nous accompagnons tous vos déplacements en Belgique et à l’étranger. Peu importe votre destination, nous nous engageons à ce que votre expérience soit à l’image de vos espérances, avec deux priorités : <b>votre sécurité et votre confort</b>.</p>
        <ul className="sc-who-facts rv">
          <li><b>Depuis plus de 40 ans</b><span>Entreprise familiale</span></li>
          <li><b>Perwez</b><span>Dépôt dans le Brabant wallon</span></li>
          <li><b>Partenaire</b><span>de la Province du Brabant wallon</span></li>
          <li><b>Membre</b><span>de la Fédération belge des entrepreneurs de transport par autobus et autocars</span></li>
        </ul>
        <Link href="/a-propos" className="sc-btn sc-btn-dark">À propos de nous <ArrowRight size={16} /></Link>
      </div>
    </section>

    <section className="sc-section" id="services">
      <div className="sc-head"><div><Kicker n="04">Nos services</Kicker><h2 className="rv">Un autocar pour chaque projet.</h2></div><p className="sc-note">Vous êtes enseignant, responsable d’association ou organisateur d’événement ? Quel que soit le motif de vos déplacements, nous sommes à votre service.</p></div>
      <div className="sc-services">{services.map((sv, i) => {
        const Icon = sv.icon;
        return <Link key={sv.title} href={sv.href ?? `/demande-de-transport?type=${encodeURIComponent(sv.type ?? '')}`} className="sc-service rv" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
          <span className="sc-service-icon"><Icon size={22} /></span><h3>{sv.title}</h3><p>{sv.text}</p>
          <span className="sc-textlink">{sv.href ? 'Voir les voyages' : 'Organiser ce transport'} <ArrowRight size={15} /></span>
        </Link>;
      })}</div>
    </section>

    <section className="sc-heritage">
      <div className="sc-head"><div><Kicker n="05">Notre histoire</Kicker><h2 className="rv">Plus de 40 ans sur la route.</h2></div><p className="sc-note">Des premiers autocars aux couleurs B-TRAVEL jusqu’aux traversées vers l’étranger : une histoire de famille, de confiance et de kilomètres partagés.</p></div>
      <div className="sc-heritage-track" tabIndex={0} role="region" aria-label="Photos d’archives, faire défiler horizontalement">{content.historyImages.map((src, i) => <figure key={src} className="rv" style={{ transitionDelay: `${(i % 3) * 70}ms` }}><img src={src} alt={`Archives B-TRAVEL, photographie ${i + 1}`} loading="lazy" /><figcaption>Archives B-TRAVEL · {String(i + 1).padStart(2, '0')}</figcaption></figure>)}</div>
      <Link href="/a-propos" className="sc-textlink">Découvrir notre histoire <ArrowRight size={15} /></Link>
    </section>

    <section className="sc-section sc-section-tint">
      <div className="sc-head"><div><Kicker n="06">Prochains départs</Kicker><h2 className="rv">Voyages organisés au départ de Perwez, Wavre et Bruxelles.</h2></div><Link href="/voyages" className="sc-textlink">Tous nos voyages <ArrowRight size={15} /></Link></div>
      <TripCards trips={list} loading={trips.isLoading} error={trips.isError} retry={() => trips.refetch()} />
      {!trips.isLoading && !hasApiCologne && <AnnouncementCard />}
    </section>

    <section className="sc-section sc-reviews">
      <div className="sc-head"><div><Kicker n="07">Ce qu’ils disent de nous</Kicker><h2 className="rv">« Excellent », sur la base de 16 avis Google.</h2></div></div>
      <div className="sc-review-row" tabIndex={0} role="region" aria-label="Avis clients">{reviews.filter(r => !r.text.startsWith('Avis sans')).map((r, i) => <figure key={r.name} className="sc-review rv" style={{ transitionDelay: `${i * 80}ms` }}><div className="sc-stars" role="img" aria-label="Note : 5 étoiles sur 5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={14} fill="currentColor" />)}</div><blockquote>« {r.text} »</blockquote><figcaption><span className="sc-avatar">{r.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span><span>{r.name}<small className="sc-mono">{r.date} · Google</small></span></figcaption></figure>)}</div>
    </section>

    <section className="sc-quotezone" id="devis">
      <div className="sc-quotezone-intro">
        <Kicker n="08">Demande de devis</Kicker>
        <h2 className="rv">Parlez-nous de votre trajet.</h2>
        <p>Trois étapes, environ deux minutes. Nous vous répondons avec un devis personnalisé, gratuit et sans engagement.</p>
        <ul className="sc-quotezone-list"><li><Check size={16} />Réponse par notre équipe, pas par un robot</li><li><Check size={16} />Prix validé au cas par cas</li><li><Check size={16} />Aucun paiement en ligne</li></ul>
        <div className="sc-quotezone-contact"><a href={PHONE_HREF}><Phone size={16} />{A.phone}</a><a href={`mailto:${A.email}`}><Mail size={16} />{A.email}</a></div>
      </div>
      <QuoteForm phone={A.phone} phoneHref={PHONE_HREF} />
    </section>

    <section className="sc-section sc-partners">
      <Kicker n="09">Partenaires et réseaux</Kicker>
      <div className="sc-partner-row">{content.partners.map(p => <div className="sc-partner rv" key={p.name}><img src={p.image} alt={p.name} loading="lazy" /><p>{p.description}</p></div>)}
        <a className="sc-partner sc-fb rv" href={content.facebook} target="_blank" rel="noreferrer"><span className="sc-mono">Suivez-nous sur les réseaux</span><strong>Facebook · Autocars B-TRAVEL</strong><ArrowUpRight /></a></div>
    </section>
  </main></PublicLayout>;
}

/* ---------- Voyages ---------- */
export function TripsPage() {
  const q = useListPublicTrips();
  const list = q.data ?? [];
  const hasApiCologne = list.some(isCologne);
  return <PublicLayout title="Voyages organisés" description="Excursions et voyages organisés au départ de Perwez, Wavre et Bruxelles : marchés de Noël, parcs d’attractions, city trips."><main>
    <PageHero image={upcomingEvent?.image ?? content.heroImage} kicker="Voyages organisés" title="Les voyages à venir." meta={['Perwez · Wavre · Bruxelles', 'Réservation sur demande']}><p>Excursions et circuits organisés en Belgique, France, Pays-Bas et au-delà. Notre équipe confirme chaque inscription manuellement.</p></PageHero>
    <section className="sc-section">
      <div className="sc-head"><div><Kicker n="01">À l’affiche</Kicker><h2>Prochains départs</h2></div></div>
      <TripCards trips={list} loading={q.isLoading} error={q.isError} retry={() => q.refetch()} limit={50} />
      {!q.isLoading && !hasApiCologne && <AnnouncementCard />}
      {!q.isLoading && !q.isError && !list.length && !upcomingEvent && <div className="sc-state"><CalendarDays /><span>Aucun voyage publié pour le moment. Revenez bientôt.</span></div>}
    </section>
    <section className="sc-section sc-section-tint" id="archives">
      <div className="sc-head"><div><Kicker n="02">Archives</Kicker><h2>Ils sont déjà partis avec nous.</h2></div><p className="sc-note">Voyages passés repris de l’ancien site, conservés pour mémoire. Ils ne sont plus réservables.</p></div>
      <ArchiveGrid />
    </section>
  </main></PublicLayout>;
}

function EventBody({ md, archive }: { md: string; archive?: boolean }) {
  const skip = [/^## /];
  if (archive) skip.push(/Réservez dès maintenant/i);
  return <SourceMarkdown md={md} skip={skip} />;
}
export function ArchivePage({ slug }: { slug: string }) {
  const ev = pastEvents.find(e => e.slug === slug);
  if (!ev) { if (upcomingEvent?.slug === slug) return <Redirect to={`/voyages/programme/${slug}`} />; return <Redirect to="/voyages" />; }
  return <PublicLayout title={cleanTitle(ev.title)}><main>
    <PageHero image={ev.image} kicker="Archive · voyage passé" title={cleanTitle(ev.title)} meta={[longDate(ev.date), ev.priceLabel, 'Non réservable']} />
    <section className="sc-detail">
      <Link href="/voyages" className="sc-textlink"><ArrowLeft size={15} /> Tous les voyages</Link>
      <div className="sc-detail-grid">
        <article><EventBody md={ev.markdown} archive /></article>
        <aside className="sc-side-card sc-side-past"><span className="sc-chip sc-chip-solid">Voyage passé</span><p>Cette sortie a déjà eu lieu. Le programme est conservé tel qu’il figurait sur l’ancien site ; dates, horaires et prix ne sont plus valables.</p><Link href="/voyages" className="sc-textlink">Voir les départs actuels <ArrowRight size={15} /></Link></aside>
      </div>
    </section>
  </main></PublicLayout>;
}
export function ProgrammePage({ slug }: { slug: string }) {
  const q = useListPublicTrips();
  const ev = upcomingEvent?.slug === slug ? upcomingEvent : undefined;
  if (!ev) return <Redirect to={eventRoute(slug)} />;
  const apiTrip = (q.data ?? []).find(isCologne);
  if (apiTrip) return <Redirect to={`/voyages/${apiTrip.id}`} />;
  const subject = encodeURIComponent('Marché de Noël de Cologne, samedi 12 décembre 2026');
  return <PublicLayout title={ev.title}><main>
    <PageHero image={ev.image} kicker="Annonce · voyage organisé" title={ev.title} meta={['Samedi 12 décembre 2026', '50 € par personne']} />
    <section className="sc-detail">
      <Link href="/voyages" className="sc-textlink"><ArrowLeft size={15} /> Tous les voyages</Link>
      <div className="sc-detail-grid">
        <article>
          <ol className="sc-timeline"><li><b>7h00</b>Perwez, arrêt de bus devant Mr. Bricolage</li><li><b>7h20</b>Wavre, parking Quick</li><li><b>8h00</b>Bruxelles, Place Flagey</li><li><b>vers 20h00</b>Retour de Cologne</li></ol>
          <EventBody md={ev.markdown} />
        </article>
        <aside className="sc-side-card">
          <span className="sc-mono">Prix par personne</span><strong className="sc-price">50 €</strong>
          <p>Transport aller-retour en autocar et petit-déjeuner inclus.</p>
          <div className="sc-warn"><CircleAlert size={16} /><span>Inscription sur demande. Aucune place n’est réservée ni garantie en ligne : la disponibilité est confirmée par l’équipe B-TRAVEL. Pas de paiement en ligne.</span></div>
          <a className="sc-btn sc-btn-dark sc-full" href={`mailto:${A.email}?subject=${subject}`}><Mail size={16} /> Demander par e-mail</a>
          <a className="sc-btn sc-btn-outline sc-full" href={PHONE_HREF}><Phone size={15} /> {A.phone}</a>
        </aside>
      </div>
    </section>
  </main></PublicLayout>;
}

/* ---------- About ---------- */
export function AboutPage() {
  const imgs = content.historyImages;
  return <PublicLayout title="À propos de nous" description="B-TRAVEL, entreprise familiale de transport de personnes en autocars depuis plus de 40 ans, basée à Perwez dans le Brabant wallon."><main>
    <PageHero image={content.depotImage} kicker="À propos de nous" title="Une histoire de famille, depuis plus de 40 ans." meta={['Entreprise familiale', 'Dépôt à Perwez, Brabant wallon']} />
    <section className="sc-team">
      <figure className="sc-team-photo rv"><img src={content.teamImage} alt="L’équipe B-TRAVEL devant un autocar double étage, au dépôt de Perwez" /><figcaption>L’équipe B-TRAVEL au dépôt de Perwez</figcaption></figure>
      <div className="sc-team-copy">
        <Kicker n="01">Qui sommes-nous ?</Kicker>
        <h2 className="rv">Une équipe familiale à votre service.</h2>
        <p className="rv">Active depuis plus de 40 ans, <b>B-TRAVEL</b> est une société familiale spécialisée dans le transport de personnes en autocars. Le parc des véhicules se situe à Perwez, dans la province du Brabant wallon.</p>
        <p className="rv">Depuis plus de 40 ans, B-TRAVEL accompagne écoles, entreprises et groupes dans tous leurs déplacements en Belgique et à l’étranger. Vous êtes enseignant et vous devez organiser le transport de vos élèves vers un musée ? Vous avez besoin de navettes pour votre évènement ? Un voyage à l’étranger ? Quel que soit le motif de vos déplacements, nous sommes à votre service.</p>
        <ul className="sc-who-facts rv">
          <li><b>Plus de 40 ans</b><span>d’expérience familiale</span></li>
          <li><b>Jusqu’à 83 places</b><span>du minibus au double étage</span></li>
          <li><b>Partenaire</b><span>de la Province du Brabant wallon</span></li>
          <li><b>Membre</b><span>de la Fédération belge des entrepreneurs de transport par autobus et autocars</span></li>
        </ul>
      </div>
    </section>
    <section className="sc-split">
      <img src={content.fleetImage} alt="Trois autocars B-TRAVEL au dépôt" className="rv" loading="lazy" />
      <div className="rv"><Kicker n="02">Pourquoi nous choisir ?</Kicker><h2>Sécurité et confort.</h2><p>Peu importe votre destination, nous nous engageons à ce que votre expérience avec <b>B-TRAVEL</b> soit à l’image de vos espérances. Nous insistons sur deux points en particulier : votre sécurité et votre confort.</p><p>Nos autocars, allant jusqu’à 83 places, sont soigneusement sélectionnés pour offrir un maximum de confort et sont équipés des dernières technologies de sécurité.</p><Link href="/legislation" className="sc-textlink">La réglementation des chauffeurs <ArrowRight size={15} /></Link></div>
    </section>
    <section className="sc-section sc-section-tint">
      <div className="sc-head"><div><Kicker n="03">Notre histoire</Kicker><h2>Des archives à aujourd’hui.</h2></div><p className="sc-note">Quelques photographies d’archives des premiers autocars aux couleurs de B-TRAVEL.</p></div>
      <div className="sc-gallery">{imgs.map((src, i) => <figure key={src} className="rv"><img src={src} alt={`Archives B-TRAVEL, photographie ${i + 1}`} loading="lazy" /><figcaption className="sc-mono">Archives · {String(i + 1).padStart(2, '0')}</figcaption></figure>)}</div>
    </section>
    <section className="sc-section sc-partners">
      <Kicker n="04">Partenaires et réseaux</Kicker>
      <div className="sc-partner-row">{content.partners.map(p => <div className="sc-partner rv" key={p.name}><img src={p.image} alt={p.name} loading="lazy" /><p>{p.description}</p></div>)}</div>
    </section>
    <section className="sc-cta-band"><h2>Parlons de votre trajet.</h2><div><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link><Link href="/contact" className="sc-btn sc-btn-ghost">Nous contacter</Link></div></section>
  </main></PublicLayout>;
}

/* ---------- Vehicles ---------- */
export function VehiclesPage() {
  return <PublicLayout title="Nos autocars" description="Du minibus au double étage de 83 places : découvrez la flotte B-TRAVEL et choisissez l’autocar adapté à votre groupe."><main>
    <PageHero cutout={content.fleet[1].image} kicker="Nos véhicules" title="Voyagez en toute sérénité." meta={['13 modèles', 'Jusqu’à 83 places']}><p>Nos autocars, allant jusqu’à 83 places, sont soigneusement sélectionnés pour offrir un maximum de confort et sont équipés des dernières technologies de sécurité.</p></PageHero>
    <section className="sc-fleetzone">
      <div className="sc-head sc-head-light"><div><Kicker n="01">Trouver le bon véhicule</Kicker><h2>Du minibus au double étage.</h2></div></div>
      <FleetChooser />
    </section>
    {fleetCategories.map((c, ci) => <section key={c.id} className={`sc-section${ci % 2 ? ' sc-section-tint' : ''}`}>
      <div className="sc-head"><div><Kicker n={String(ci + 2).padStart(2, '0')}>{c.seats}</Kicker><h2>{c.name}</h2></div><p className="sc-note">{c.description}</p></div>
      <div className="sc-fleet">{c.models.map((f, i) => <figure key={f.name} className="sc-model rv" style={{ transitionDelay: `${(i % 3) * 60}ms` }}><div><img src={f.image} alt={f.name} loading="lazy" /></div><figcaption><h3>{f.name}</h3><Link className="sc-textlink" href={`/demande-de-transport?vehicule=${encodeURIComponent(`${c.name} (${f.name})`)}`}>Devis <ArrowRight size={14} /></Link></figcaption></figure>)}</div>
    </section>)}
    <section className="sc-cta-band"><h2>Quel véhicule pour votre groupe ?</h2><div><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link></div></section>
  </main></PublicLayout>;
}

/* ---------- Contact ---------- */
export function Contact() {
  return <PublicLayout title="Contact" description="Contactez B-TRAVEL à Perwez : +32 10 65 02 01, info@b-travel.be, ou écrivez-nous via le formulaire de contact."><main>
    <PageHero kicker="Contact" title="Un mot suffit pour commencer." meta={['Réponse rapide', 'Perwez, Brabant wallon']}><p>Une question, une demande d’information ou un projet de voyage ? Écrivez-nous ou appelez-nous.</p></PageHero>
    <section className="sc-quotezone sc-contactzone">
      <div className="sc-quotezone-intro">
        <h2>Nous contacter</h2>
        <div className="sc-contact-list">
          <a href={PHONE_HREF}><span>Téléphone</span><strong>{A.phone}</strong></a>
          <a href={`mailto:${A.email}`}><span>E-mail</span><strong>{A.email}</strong></a>
          <div><span>Siège d’exploitation</span><strong>{A.operating}</strong></div>
          <div><span>Siège social</span><strong>{A.registered}</strong></div>
          <div><span>Fax · TVA</span><strong>{A.fax} · {A.vat}</strong></div>
          <a href={content.facebook} target="_blank" rel="noreferrer"><span>Facebook</span><strong>Autocars B-TRAVEL</strong></a>
        </div>
        <div className="sc-contact-devis"><p>Vous avez un trajet précis à organiser ?</p><Link href="/demande-de-transport" className="sc-btn sc-btn-outline">Demander un devis <ArrowRight size={16} /></Link></div>
      </div>
      <ContactForm phone={A.phone} phoneHref={PHONE_HREF} />
    </section>
  </main></PublicLayout>;
}

/* ---------- Legal ---------- */
export function LegislationPage() {
  return <PublicLayout title="Législation" description="Temps de conduite et de repos des chauffeurs d’autocar : la réglementation appliquée par B-TRAVEL."><main>
    <PageHero kicker="Législation" title="Les règles de la route." meta={['Temps de conduite', 'Tachygraphe']} />
    <section className="sc-detail sc-legal">
      <div className="sc-warn sc-warn-wide"><CircleAlert size={18} /><span>Information reproduite de l’ancien site b-travel.be. Elle doit être vérifiée au regard de la réglementation en vigueur et ne constitue pas une validation de planification opérationnelle.</span></div>
      <SourceMarkdown md={pageMd('legislation')} skip={[/^## Législation/]} />
    </section>
  </main></PublicLayout>;
}
export function TermsPage() {
  const md = pageMd('termes-et-conditions').replace('+32 2 123 45 67', '+32 10 65 02 01');
  return <PublicLayout title="Conditions générales"><main>
    <PageHero kicker="Termes et conditions" title="Conditions générales d’utilisation." meta={['Droit belge', '10 articles']} />
    <section className="sc-detail sc-legal">
      <div className="sc-warn sc-warn-wide"><CircleAlert size={18} /><span>Texte repris de l’ancien site, en attente de validation juridique. Actuellement, les demandes et inscriptions sont confirmées manuellement par l’équipe et aucun paiement en ligne n’est proposé.</span></div>
      <SourceMarkdown md={md} skip={[/^## Termes/]} />
    </section>
  </main></PublicLayout>;
}

/* ---------- API trip detail (logic preserved) ---------- */
export function TripDetail({ id }: { id: string }) {
  const trip = useGetPublicTrip(id);
  const idempotency = useRef({ payload: '', key: crypto.randomUUID() });
  const create = useMutation({
    mutationFn: ({ data, key }: { data: TripRequestInput; key: string }) => createTripRequest(data, { headers: { 'Idempotency-Key': key } }),
  });
  const [sent, setSent] = useState(false);
  if (trip.isLoading) return <PublicLayout><main className="sc-plain"><div className="sc-skel sc-skel-tall" /></main></PublicLayout>;
  if (trip.isError || !trip.data) return <PublicLayout><main className="sc-plain"><div className="sc-state"><CircleAlert />Ce voyage n’est pas accessible.<Link href="/voyages" className="sc-textlink">Voir les voyages</Link></div></main></PublicLayout>;
  const t = trip.data;
  const submit = (form: FormData) => {
    const data: TripRequestInput = { tripId: t.id, contactName: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), seatCount: Number(form.get('seats')), notes: String(form.get('notes') || '') };
    const payload = JSON.stringify(data);
    if (idempotency.current.payload && idempotency.current.payload !== payload) idempotency.current = { payload, key: crypto.randomUUID() };
    else idempotency.current.payload = payload;
    create.mutate({ data, key: idempotency.current.key }, { onSuccess: () => setSent(true) });
  };
  return <PublicLayout title={t.title} description={t.description?.slice(0, 155)}><main>
    <PageHero image={t.imageUrl || content.heroImage} kicker={`Prochain départ · ${date(t.startDate)}`} title={t.title} meta={[t.destination, `${t.remainingSeats} places disponibles`]} />
    <section className="sc-detail">
      <Link href="/voyages" className="sc-textlink"><ArrowLeft size={15} /> Tous les voyages</Link>
      <div className="sc-detail-grid">
        <article className="sc-prose"><p className="sc-lead">{t.description}</p>{t.program && <><h3>Au programme</h3><p style={{ whiteSpace: 'pre-line' }}>{t.program}</p></>}<p className="sc-meta"><MapPin size={16} />{t.destination}<Users size={16} />{t.remainingSeats} places disponibles</p></article>
        <aside className="sc-side-card"><span className="sc-mono">Réservation sur demande</span><strong className="sc-price">{money(t.priceCents)} <small>/ personne</small></strong>
          {sent ? <div className="sc-success"><Check />Votre demande est envoyée. Notre équipe vous recontactera pour confirmer votre inscription.</div> : t.remainingSeats <= 0 ? <div className="sc-state"><CircleAlert />Ce voyage est complet.</div> :
            <form onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="sc-form">
              <label>Nom complet<input name="name" required minLength={2} autoComplete="name" /></label>
              <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" /></label>
              <label>Téléphone<input name="phone" required minLength={6} autoComplete="tel" /></label>
              <label>Nombre de places<input name="seats" type="number" min="1" max={t.remainingSeats} defaultValue="1" required /></label>
              <label>Message <span className="sc-opt">facultatif</span><textarea name="notes" rows={3} /></label>
              <button className="sc-btn sc-btn-dark sc-full" disabled={create.isPending}>{create.isPending ? 'Envoi en cours…' : 'Demander des places'} <ArrowRight size={16} /></button>
              {create.isError && <p className="sc-error">L’envoi a échoué. Vérifiez vos informations et réessayez.</p>}
            </form>}
        </aside>
      </div>
    </section>
  </main></PublicLayout>;
}

/* ---------- Quote page ---------- */
export function TransportRequest() {
  return <PublicLayout title="Demande de devis" description="Demandez gratuitement un devis pour votre transport en autocar : sortie scolaire, groupe, entreprise, navette ou voyage."><main>
    <PageHero cutout={content.fleet[2].image} kicker="Devis gratuit" title="Parlons de votre trajet." meta={['Réponse par l’équipe', 'Sans engagement']}><p>Décrivez votre besoin en trois étapes. Cette demande ne constitue pas une réservation : notre équipe revient vers vous avec un devis.</p></PageHero>
    <section className="sc-quotezone sc-quotezone-page">
      <div className="sc-quotezone-intro">
        <h2>Comment ça marche ?</h2>
        <ol className="sc-howto"><li><b>Vous décrivez</b> votre trajet en deux minutes.</li><li><b>Nous étudions</b> l’itinéraire et choisissons le véhicule adapté.</li><li><b>Vous recevez</b> un devis personnalisé, sans engagement.</li></ol>
        <div className="sc-quotezone-contact"><a href={PHONE_HREF}><Phone size={16} />{A.phone}</a><a href={`mailto:${A.email}`}><Mail size={16} />{A.email}</a></div>
      </div>
      <QuoteForm phone={A.phone} phoneHref={PHONE_HREF} />
    </section>
  </main></PublicLayout>;
}
