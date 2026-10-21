import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, Redirect } from 'wouter';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, CircleAlert, Mail, MapPin, Menu, Phone, RefreshCw, Users, X } from 'lucide-react';
import { useListPublicTrips, useGetPublicTrip, createQuoteRequest, createTripRequest } from '@workspace/api-client-react';
import type { PublicTrip, QuoteRequestInput, TripRequestInput } from '@workspace/api-client-react';
import content from '@/content/site-content.json';
import './scout-public.css';

/* ---------- helpers ---------- */
const money = (cents?: number) => cents == null ? '' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
const date = (value?: string) => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '';
function dateTimeLocalToIso(value: string): string {
  const [day, time] = value.split('T');
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(localAsUtc));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return new Date(localAsUtc - (representedAsUtc - localAsUtc)).toISOString();
}

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
const navLinks: [string, string][] = [['/voyages', 'Voyages'], ['/nos-vehicules', 'Nos véhicules'], ['/a-propos', 'À propos'], ['/contact', 'Contact']];
function PublicNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 40); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  const close = () => setOpen(false);
  return <header className={`sc-nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
    <span className="sc-tick sc-tick-l" aria-hidden />
    <div className="sc-nav-main">
      <Link href="/" className="sc-logo" aria-label="B-TRAVEL, accueil" onClick={close}><img src="/btravel-logo.png" alt="B-TRAVEL" /></Link>
      <nav aria-label="Navigation principale">{navLinks.map(([h, l]) => <Link key={h} href={h} onClick={close}>{l}</Link>)}</nav>
    </div>
    <span className="sc-tick sc-tick-mid" aria-hidden />
    <div className="sc-nav-side">
      <Link href="/demande-de-transport" className="sc-nav-cta" onClick={close}>Devis</Link>
      <button className="sc-burger" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? <X size={16} /> : <Menu size={16} />}</button>
    </div>
    <span className="sc-tick sc-tick-r" aria-hidden />
    <div className="sc-drawer" hidden={!open}>
      {navLinks.map(([h, l], i) => <Link key={h} href={h} onClick={close}><span>0{i + 1}</span>{l}</Link>)}
      <Link href="/demande-de-transport" onClick={close}><span>05</span>Demande de transport</Link>
      <div className="sc-drawer-meta"><a href={PHONE_HREF}>{A.phone}</a><a href={`mailto:${A.email}`}>{A.email}</a></div>
    </div>
  </header>;
}
function Footer() {
  return <footer className="sc-footer">
    <div className="sc-footer-top">
      <div><img src="/btravel-logo.png" alt="B-TRAVEL" className="sc-footer-logo" /><p>Entreprise familiale de transport de passagers en autocar. Flotte basée à Perwez, Brabant wallon.</p></div>
      <div><span className="sc-mono">Exploitation</span><p>{A.operating}</p><span className="sc-mono">Siège social</span><p>{A.registered}</p></div>
      <div><span className="sc-mono">Contact</span><p><a href={PHONE_HREF}>Tél. {A.phone}</a><br />Fax {A.fax}<br /><a href={`mailto:${A.email}`}>{A.email}</a><br />TVA {A.vat}</p></div>
      <div className="sc-footer-links"><span className="sc-mono">Plan du site</span><Link href="/voyages">Voyages</Link><Link href="/nos-vehicules">Nos véhicules</Link><Link href="/a-propos">À propos</Link><Link href="/demande-de-transport">Demande de transport</Link><Link href="/legislation">Législation</Link><Link href="/termes-et-conditions">Termes et conditions</Link><a href={content.facebook} target="_blank" rel="noreferrer">Facebook</a><Link href="/admin">Administration</Link></div>
    </div>
    <div className="sc-footer-bar"><span>© B-TRAVEL</span><span className="sc-mono">Perwez · BE</span><span className="sc-mono">Depuis plus de 40 ans</span></div>
  </footer>;
}
function PublicLayout({ children }: { children: ReactNode }) {
  useReveal();
  return <div className="public-site sc-site"><PublicNav />{children}<Footer /></div>;
}
function PageHero({ image, kicker, title, meta, children }: { image: string; kicker: string; title: ReactNode; meta?: string[]; children?: ReactNode }) {
  return <section className="sc-pagehero">
    <img src={image} alt="" className="sc-hero-img" />
    <div className="sc-hero-shade" />
    <div className="sc-pagehero-copy"><span className="sc-mono">{kicker}</span><h1>{title}</h1>{children}</div>
    {meta && <div className="sc-hero-rule"><span />{meta.map(m => <span key={m} className="sc-mono">{m}</span>)}</div>}
  </section>;
}
function Kicker({ n, children }: { n: string; children: ReactNode }) { return <div className="sc-kicker"><span>{n}</span><i />{children}</div>; }

/* ---------- trip cards (API) ---------- */
function TripCards({ trips, loading, error, retry, limit = 3 }: { trips: PublicTrip[]; loading: boolean; error: boolean; retry: () => void; limit?: number }) {
  if (loading) return <div className="sc-cards">{[1, 2, 3].map(n => <div className="sc-skel" key={n} />)}</div>;
  if (error) return <div className="sc-state"><CircleAlert /><span>Les voyages ne sont pas disponibles pour le moment.</span><button className="sc-textlink" onClick={retry}>Réessayer <RefreshCw size={15} /></button></div>;
  if (!trips.length) return null;
  return <div className="sc-cards">{trips.slice(0, limit).map((trip, i) => <Link href={`/voyages/${trip.id}`} className="sc-card rv" key={trip.id} data-testid={`card-trip-${trip.id}`}>
    <div className="sc-card-img">{trip.imageUrl ? <img src={trip.imageUrl} alt="" loading="lazy" /> : <div className="sc-card-blank"><MapPin /></div>}<span className="sc-chip">{String(i + 1).padStart(2, '0')} · Départ</span></div>
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
function ArchiveGrid() {
  return <div className="sc-archive">{pastEvents.map((e, i) => <Link key={e.slug} href={`/voyages/archives/${e.slug}`} className="sc-arch rv" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
    <div className="sc-arch-img"><img src={e.image} alt="" loading="lazy" /><span className="sc-chip">Voyage passé</span></div>
    <span className="sc-mono">{longDate(e.date)} · {e.priceLabel}</span><h3>{e.title}</h3><span className="sc-textlink">Lire l’archive <ArrowUpRight size={14} /></span>
  </Link>)}</div>;
}

/* ---------- Home ---------- */
export function Home() {
  const trips = useListPublicTrips();
  const list = trips.data ?? [];
  const hasApiCologne = list.some(isCologne);
  const reviews = content.reviews;
  const fleet = content.fleet;
  const newsletter = `mailto:${A.email}?subject=${encodeURIComponent('Inscription à la newsletter B-TRAVEL')}&body=${encodeURIComponent('Bonjour,\n\nJe souhaite recevoir les annonces des voyages organisés B-TRAVEL.\n\nNom :\n')}`;
  return <PublicLayout><main>
    <section className="sc-hero">
      <img src={content.heroImage} alt="Autocar B-TRAVEL" className="sc-hero-img sc-kenburns" />
      <div className="sc-hero-shade" />
      <div className="sc-hero-copy">
        <span className="sc-mono sc-fade" style={{ animationDelay: '.2s' }}>Autocars · Perwez, Brabant wallon</span>
        <h1 className="sc-fade" style={{ animationDelay: '.35s' }}>Sécurité et Confort.</h1>
        <div className="sc-hero-actions sc-fade" style={{ animationDelay: '.55s' }}><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link><Link href="/voyages" className="sc-btn sc-btn-ghost">Voyages organisés</Link></div>
      </div>
      <div className="sc-hero-rule"><span /><span className="sc-mono">Écoles · Navettes · Étranger</span><span className="sc-mono">Active depuis plus de 40 ans</span></div>
    </section>

    <section className="sc-intro">
      <Kicker n="01">Qui roule avec vous</Kicker>
      <p className="sc-statement rv">Active depuis plus de 40 ans, <b>B-TRAVEL</b> est une entreprise familiale spécialisée dans le transport de passagers en autocar. La flotte de véhicules est située à Perwez dans la province du Brabant Wallon.</p>
      <div className="sc-intro-grid">
        <p className="rv">Vous êtes enseignant et vous devez organiser le transport de vos élèves vers un musée ? Vous avez besoin de navettes pour votre évènement ? Un voyage à l’étranger ? Quel que soit le motif de vos déplacements, nous sommes à votre service.</p>
        <ul className="sc-spec rv"><li><span>Écoles</span>Sorties scolaires, musées</li><li><span>Évènements</span>Navettes de groupe</li><li><span>Étranger</span>Voyages en Europe</li><li><span>Capacité</span>Jusqu’à 83 places</li></ul>
      </div>
    </section>

    <section className="sc-triptych">
      {[
        { n: '02', t: 'À propos', d: 'Depuis plus de 40 ans, B-TRAVEL accompagne écoles, entreprises et groupes dans tous leurs déplacements en Belgique et à l’étranger.', h: '/a-propos', img: content.historyImages[0] },
        { n: '03', t: 'Nos véhicules', d: 'Découvrez notre flotte moderne et confortable, parfaitement entretenue pour garantir sécurité et bien-être.', h: '/nos-vehicules', img: fleet[1].image },
        { n: '04', t: 'Voyages organisés', d: 'Explorez notre sélection d’excursions et circuits organisés en Belgique, France, Pays-Bas et au-delà.', h: '/voyages', img: upcomingEvent?.image ?? content.historyImages[2] },
      ].map(c => <Link key={c.h} href={c.h} className="sc-panel rv"><img src={c.img} alt="" loading="lazy" /><div className="sc-panel-shade" /><span className="sc-mono">{c.n}</span><div className="sc-panel-copy"><h2>{c.t}</h2><p>{c.d}</p><span className="sc-textlink">Découvrir <ArrowRight size={15} /></span></div></Link>)}
    </section>

    <section className="sc-section">
      <div className="sc-head"><div><Kicker n="05">Prochains départs</Kicker><h2 className="rv">Au départ de Perwez, Wavre et Bruxelles.</h2></div><Link href="/voyages" className="sc-textlink">Tous nos voyages organisés <ArrowRight size={15} /></Link></div>
      <TripCards trips={list} loading={trips.isLoading} error={trips.isError} retry={() => trips.refetch()} />
      {!trips.isLoading && !hasApiCologne && <AnnouncementCard />}
    </section>

    <section className="sc-fleetstrip">
      <div className="sc-head sc-head-light"><div><Kicker n="06">La flotte</Kicker><h2 className="rv">Treize modèles, un même soin.</h2></div><Link href="/nos-vehicules" className="sc-textlink">Voir les véhicules <ArrowRight size={15} /></Link></div>
      <div className="sc-strip">{fleet.map((f, i) => <figure key={f.name + i}><img src={f.image} alt={f.name} loading="lazy" /><figcaption><span className="sc-mono">{String(i + 1).padStart(2, '0')}</span>{f.name}</figcaption></figure>)}</div>
    </section>

    <section className="sc-story">
      <img src={content.historyImages[3]} alt="Autocar B-TRAVEL" loading="lazy" />
      <div className="sc-hero-shade" />
      <blockquote className="rv">« Nous insistons sur deux points en particulier : votre sécurité et votre confort. »<cite className="sc-mono">B-TRAVEL · Pourquoi nous choisir</cite></blockquote>
    </section>

    <section className="sc-section sc-reviews">
      <div className="sc-head"><div><Kicker n="07">Ce qu’ils disent de nous</Kicker><h2 className="rv">Avis Google, repris de l’ancien site.</h2></div><p className="sc-note">Instantané conservé de l’ancien site b-travel.be (affiché « Excellent, basée sur 16 avis »). Ce n’est pas une note en direct.</p></div>
      <div className="sc-review-row">{reviews.filter(r => !r.text.startsWith('Avis sans')).map((r, i) => <figure key={r.name} className="sc-review rv" style={{ transitionDelay: `${i * 80}ms` }}><blockquote>« {r.text} »</blockquote><figcaption><span className="sc-avatar">{r.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span><span>{r.name}<small className="sc-mono">{r.date} · Google</small></span></figcaption></figure>)}</div>
      <div className="sc-ratings"><span className="sc-mono">Évaluations sans commentaire</span>{reviews.filter(r => r.text.startsWith('Avis sans')).map(r => <span key={r.name}>{r.name} <small className="sc-mono">{r.date}</small></span>)}</div>
    </section>

    <section className="sc-newsletter">
      <img src={content.historyImages[1]} alt="" loading="lazy" />
      <div className="sc-news-card rv">
        <Kicker n="08">Newsletter</Kicker>
        <h2>Ne manquez aucun départ.</h2>
        <p>Parcs d’attractions, journées shopping, marchés de Noël et city trips : recevez les annonces de nos voyages organisés dès leur ouverture.</p>
        <a href={newsletter} className="sc-btn sc-btn-dark"><Mail size={16} /> Demander l’inscription par e-mail</a>
        <small>Ouvre votre messagerie vers {A.email}. L’inscription est demandée par e-mail, elle n’est pas automatisée sur ce site.</small>
      </div>
    </section>

    <section className="sc-section sc-partners">
      <Kicker n="09">Partenaires et réseaux</Kicker>
      <div className="sc-partner-row">{content.partners.map(p => <div className="sc-partner rv" key={p.name}><img src={p.image} alt={p.name} loading="lazy" /><p>{p.description}</p></div>)}
        <a className="sc-partner sc-fb rv" href={content.facebook} target="_blank" rel="noreferrer"><span className="sc-mono">Suivez-nous sur les réseaux</span><strong>Facebook · Autocars B-TRAVEL</strong><ArrowUpRight /></a></div>
    </section>

    <section className="sc-cta-band"><h2 className="rv">Votre prochain trajet commence ici.</h2><div><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link><a href={PHONE_HREF} className="sc-btn sc-btn-ghost"><Phone size={15} /> {A.phone}</a></div></section>
  </main></PublicLayout>;
}

/* ---------- Voyages ---------- */
export function TripsPage() {
  const q = useListPublicTrips();
  const list = q.data ?? [];
  const hasApiCologne = list.some(isCologne);
  return <PublicLayout><main>
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
  return <PublicLayout><main>
    <PageHero image={ev.image} kicker="Archive · voyage passé" title={ev.title} meta={[longDate(ev.date), ev.priceLabel, 'Non réservable']} />
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
  return <PublicLayout><main>
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
  return <PublicLayout><main>
    <PageHero image={imgs[2]} kicker="À propos" title="Depuis plus de 40 ans, sur la route." meta={['Entreprise familiale', 'Perwez, Brabant wallon']} />
    <section className="sc-intro">
      <Kicker n="01">Qui sommes-nous ?</Kicker>
      <p className="sc-statement rv">Active depuis plus de 40 ans, <b>B-TRAVEL</b> est une société familiale spécialisée dans le transport de personnes en autocars. Le parc des véhicules se situe à Perwez dans la province du Brabant Wallon.</p>
    </section>
    <section className="sc-split">
      <img src={imgs[4]} alt="Autocar B-TRAVEL" className="rv" loading="lazy" />
      <div className="rv"><Kicker n="02">Pourquoi nous choisir ?</Kicker><h2>Sécurité et confort.</h2><p>Peu importe votre destination, nous nous engageons à ce que votre expérience avec <b>B-TRAVEL</b> soit à l’image de vos espérances. Nous insistons sur deux points en particulier : votre sécurité et votre confort.</p><Link href="/legislation" className="sc-textlink">La réglementation des chauffeurs <ArrowRight size={15} /></Link></div>
    </section>
    <section className="sc-section">
      <div className="sc-head"><div><Kicker n="03">Galerie</Kicker><h2>La flotte, au dépôt et sur la route.</h2></div></div>
      <div className="sc-gallery">{imgs.map((src, i) => <figure key={src} className="rv"><img src={src} alt={`Photographie B-TRAVEL ${i + 1}`} loading="lazy" /><figcaption className="sc-mono">{String(i + 1).padStart(2, '0')} / {String(imgs.length).padStart(2, '0')}</figcaption></figure>)}</div>
    </section>
    <section className="sc-cta-band"><h2>Parlons de votre trajet.</h2><div><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link></div></section>
  </main></PublicLayout>;
}

/* ---------- Vehicles ---------- */
export function VehiclesPage() {
  const fleet = content.fleet;
  return <PublicLayout><main>
    <PageHero image={fleet[0].image} kicker="Nos véhicules" title="Voyagez en toute sérénité." meta={['13 modèles', 'Jusqu’à 83 places']}><p>Nos autocars, allant jusqu’à 83 places, sont soigneusement sélectionnés pour offrir un maximum de confort et sont équipés des dernières technologies de sécurité.</p></PageHero>
    <section className="sc-section">
      <div className="sc-head"><div><Kicker n="01">La flotte</Kicker><h2>Du minibus au double étage.</h2></div></div>
      <div className="sc-fleet">{fleet.map((f, i) => <figure key={f.name + i} className="sc-model rv" style={{ transitionDelay: `${(i % 3) * 60}ms` }}><div><img src={f.image} alt={f.name} loading="lazy" /></div><figcaption><span className="sc-mono">{String(i + 1).padStart(2, '0')} / 13</span><h3>{f.name}</h3></figcaption></figure>)}</div>
    </section>
    <section className="sc-cta-band"><h2>Quel véhicule pour votre groupe ?</h2><div><Link href="/demande-de-transport" className="sc-btn sc-btn-light">Demander un devis <ArrowRight size={16} /></Link></div></section>
  </main></PublicLayout>;
}

/* ---------- Contact ---------- */
export function Contact() {
  return <PublicLayout><main>
    <PageHero image={content.historyImages[5]} kicker="Contact" title="Un mot suffit pour commencer." meta={['Perwez', 'Nil-Saint-Vincent']} />
    <section className="sc-section">
      <div className="sc-contact">
        <a href={PHONE_HREF} className="rv"><span className="sc-mono">Téléphone</span><strong>{A.phone}</strong></a>
        <a href={`mailto:${A.email}`} className="rv"><span className="sc-mono">E-mail</span><strong>{A.email}</strong></a>
        <div className="rv"><span className="sc-mono">Fax</span><strong>{A.fax}</strong></div>
        <div className="rv"><span className="sc-mono">Siège d’exploitation</span><strong>{A.operating}</strong></div>
        <div className="rv"><span className="sc-mono">Siège social</span><strong>{A.registered}</strong></div>
        <div className="rv"><span className="sc-mono">TVA</span><strong>{A.vat}</strong></div>
        <a href={content.facebook} target="_blank" rel="noreferrer" className="rv"><span className="sc-mono">Facebook</span><strong>Autocars B-TRAVEL</strong></a>
      </div>
      <div className="sc-actions"><Link href="/demande-de-transport" className="sc-btn sc-btn-dark">Demander un devis <ArrowRight size={16} /></Link><Link href="/voyages" className="sc-btn sc-btn-outline">Voir les voyages</Link></div>
    </section>
  </main></PublicLayout>;
}

/* ---------- Legal ---------- */
export function LegislationPage() {
  return <PublicLayout><main>
    <PageHero image={content.historyImages[0]} kicker="Législation" title="Les règles de la route." meta={['Temps de conduite', 'Tachygraphe']} />
    <section className="sc-detail sc-legal">
      <div className="sc-warn sc-warn-wide"><CircleAlert size={18} /><span>Information reproduite de l’ancien site b-travel.be. Elle doit être vérifiée au regard de la réglementation en vigueur et ne constitue pas une validation de planification opérationnelle.</span></div>
      <SourceMarkdown md={pageMd('legislation')} skip={[/^## Législation/]} />
    </section>
  </main></PublicLayout>;
}
export function TermsPage() {
  const md = pageMd('termes-et-conditions').replace('+32 2 123 45 67', '+32 10 65 02 01');
  return <PublicLayout><main>
    <PageHero image={content.historyImages[1]} kicker="Termes et conditions" title="Conditions générales d’utilisation." meta={['Droit belge', '10 articles']} />
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
  return <PublicLayout><main>
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

/* ---------- Quote form (logic preserved) ---------- */
export function TransportRequest() {
  const idempotency = useRef({ payload: '', key: crypto.randomUUID() });
  const create = useMutation({
    mutationFn: ({ data, key }: { data: QuoteRequestInput; key: string }) => createQuoteRequest(data, { headers: { 'Idempotency-Key': key } }),
  });
  const [sent, setSent] = useState(false);
  const [journeyType, setJourneyType] = useState<QuoteRequestInput['journeyType']>('one_way');
  const submit = (form: FormData) => {
    const returnValue = String(form.get('return') || '');
    const data: QuoteRequestInput = {
      contactName: String(form.get('name')),
      organizationName: String(form.get('org') || ''),
      email: String(form.get('email')),
      phone: String(form.get('phone')),
      transportType: String(form.get('type')),
      journeyType,
      departureAt: dateTimeLocalToIso(String(form.get('depart'))),
      returnAt: journeyType === 'return' && returnValue ? dateTimeLocalToIso(returnValue) : undefined,
      pickupAddress: String(form.get('pickup')),
      destination: String(form.get('destination')),
      passengerCount: Number(form.get('passengers')),
      notes: [
        String(form.get('notes') || ''),
        ...([['Adresse de facturation (rue et numéro)', 'billingStreet'], ['Code postal', 'billingPostal'], ['Ville', 'billingCity'], ['TVA', 'vat']] as const)
          .map(([label, key]) => [label, String(form.get(key) || '').trim()] as const)
          .filter(([, v]) => v).map(([label, v]) => `${label} : ${v}`),
      ].filter(Boolean).join('\n'),
    };
    const payload = JSON.stringify(data);
    if (idempotency.current.payload && idempotency.current.payload !== payload) idempotency.current = { payload, key: crypto.randomUUID() };
    else idempotency.current.payload = payload;
    create.mutate({ data, key: idempotency.current.key }, { onSuccess: () => setSent(true) });
  };
  return <PublicLayout><main>
    <PageHero image={content.fleet[2].image} kicker="Devis en ligne" title="Parlons de votre trajet." meta={['Réponse par l’équipe', 'Sans engagement']}><p>Décrivez votre besoin. Cette demande ne constitue pas une réservation : notre équipe reviendra vers vous avec un devis.</p></PageHero>
    <section className="sc-detail">
      {sent ? <div className="sc-success sc-success-lg"><Check /><div><strong>Demande bien reçue.</strong><p>Notre équipe étudie votre trajet et vous recontactera.</p></div></div> :
        <form className="sc-quote" onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
          <div className="sc-form-title"><span>01</span>Vos coordonnées</div>
          <div className="sc-grid2"><label>Nom / référent<input name="name" required minLength={2} /></label><label>Organisation <span className="sc-opt">facultatif</span><input name="org" /></label><label>E-mail<input name="email" type="email" required /></label><label>Téléphone<input name="phone" required minLength={6} /></label><label className="sc-span">Rue et numéro <span className="sc-opt">facultatif</span><input name="billingStreet" autoComplete="street-address" /></label><label>Code postal <span className="sc-opt">facultatif</span><input name="billingPostal" autoComplete="postal-code" /></label><label>Ville <span className="sc-opt">facultatif</span><input name="billingCity" autoComplete="address-level2" /></label><label className="sc-span">TVA si assujetti <span className="sc-opt">facultatif</span><input name="vat" /></label></div>
          <div className="sc-form-title"><span>02</span>Votre trajet</div>
          <div className="sc-grid2"><label>Type de transport<input name="type" placeholder="Autocar, minibus…" required /></label><label>Type de trajet<select name="journey" value={journeyType} onChange={e => setJourneyType(e.target.value as QuoteRequestInput['journeyType'])}><option value="one_way">Aller simple</option><option value="return">Aller-retour</option></select></label><label>Départ<input name="depart" type="datetime-local" required /></label><label>Retour <span className="sc-opt">si aller-retour</span><input name="return" type="datetime-local" required={journeyType === 'return'} /></label><label>Lieu de prise en charge<input name="pickup" required /></label><label>Destination<input name="destination" required /></label><label>Nombre de passagers<input name="passengers" type="number" min="1" required /></label><label className="sc-span">Précisions <span className="sc-opt">facultatif</span><textarea name="notes" rows={4} /></label></div>
          <button className="sc-btn sc-btn-dark" disabled={create.isPending}>{create.isPending ? 'Envoi…' : 'Envoyer ma demande'} <ArrowRight size={16} /></button>
          {create.isError && <p className="sc-error">Impossible d’envoyer la demande. Merci de réessayer.</p>}
        </form>}
    </section>
  </main></PublicLayout>;
}
