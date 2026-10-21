import { type ReactNode, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Phone } from 'lucide-react';
import { createQuoteRequest } from '@workspace/api-client-react';
import type { QuoteRequestInput } from '@workspace/api-client-react';
import { transportTypes } from './fleet';

/** Convertit une date et une heure saisies à Bruxelles en instant ISO. */
export function brusselsToIso(day: string, time: string): string {
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

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

type Values = {
  type: string; passengers: string; journey: QuoteRequestInput['journeyType'];
  departDay: string; departTime: string; returnDay: string; returnTime: string;
  pickup: string; destination: string;
  name: string; org: string; email: string; phone: string; notes: string;
  billingStreet: string; billingPostal: string; billingCity: string; vat: string;
};

function initialValues(): Values {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') ?? '';
  return {
    type: transportTypes.some(t => t.value === type) ? type : '',
    passengers: /^\d{1,3}$/.test(params.get('passagers') ?? '') ? String(params.get('passagers')) : '',
    journey: 'return', departDay: params.get('date') ?? '', departTime: '08:00', returnDay: '', returnTime: '17:00',
    pickup: '', destination: params.get('destination') ?? '',
    name: '', org: '', email: '', phone: '', notes: params.get('vehicule') ? `Véhicule souhaité : ${params.get('vehicule')}` : '',
    billingStreet: '', billingPostal: '', billingCity: '', vat: '',
  };
}

const steps = ['Votre projet', 'Dates et lieux', 'Vos coordonnées'];

export function QuoteForm({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const [v, setV] = useState<Values>(initialValues);
  const [step, setStep] = useState(0);
  const [billing, setBilling] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const idempotency = useRef({ payload: '', key: crypto.randomUUID() });
  const create = useMutation({
    mutationFn: ({ data, key }: { data: QuoteRequestInput; key: string }) => createQuoteRequest(data, { headers: { 'Idempotency-Key': key } }),
  });
  const set = (key: keyof Values) => (e: { target: { value: string } }) => setV(prev => ({ ...prev, [key]: e.target.value }));

  const stepIsValid = () => {
    const fields = Array.from(stepRef.current?.querySelectorAll<HTMLInputElement>('input, select, textarea') ?? []);
    const invalid = fields.find(field => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return false; }
    if (step === 0 && !v.type) { stepRef.current?.querySelector<HTMLInputElement>('input[name="type"]')?.reportValidity(); return false; }
    return true;
  };
  const go = (next: number) => {
    if (next > step && !stepIsValid()) return;
    setStep(next);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = () => {
    if (!stepIsValid()) return;
    const billingLines = ([['Adresse de facturation', v.billingStreet], ['Code postal', v.billingPostal], ['Ville', v.billingCity], ['TVA', v.vat]] as const)
      .filter(([, value]) => value.trim()).map(([label, value]) => `${label} : ${value.trim()}`);
    const data: QuoteRequestInput = {
      contactName: v.name.trim(),
      organizationName: v.org.trim() || undefined,
      email: v.email.trim(),
      phone: v.phone.trim(),
      transportType: v.type,
      journeyType: v.journey,
      departureAt: brusselsToIso(v.departDay, v.departTime),
      returnAt: v.journey === 'return' ? brusselsToIso(v.returnDay, v.returnTime) : undefined,
      pickupAddress: v.pickup.trim(),
      destination: v.destination.trim(),
      passengerCount: Number(v.passengers),
      notes: [v.notes.trim(), ...billingLines].filter(Boolean).join('\n') || undefined,
    };
    const payload = JSON.stringify(data);
    if (idempotency.current.payload && idempotency.current.payload !== payload) idempotency.current = { payload, key: crypto.randomUUID() };
    else idempotency.current.payload = payload;
    create.mutate({ data, key: idempotency.current.key });
  };

  if (create.isSuccess) return <div className="qf qf-done" ref={topRef}>
    <span className="qf-done-icon"><Check /></span>
    <h3>Merci, votre demande est bien reçue.</h3>
    <p>Référence <strong>{create.data.reference}</strong>. Nous étudions votre trajet et revenons vers vous avec un devis personnalisé, généralement sous 48 heures ouvrables.</p>
    <p className="qf-small">Une question urgente ? Appelez-nous au <a href={phoneHref}>{phone}</a>.</p>
  </div>;

  const minReturn = v.departDay || today();
  return <div ref={topRef} className="qf-anchor"><form className="qf" noValidate onSubmit={e => { e.preventDefault(); if (step < 2) go(step + 1); else submit(); }}>
    <ol className="qf-steps" aria-label="Étapes de la demande">
      {steps.map((label, i) => <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
        <span>{i < step ? <Check size={14} /> : i + 1}</span>{label}
      </li>)}
    </ol>

    <div ref={stepRef} className="qf-body" key={step}>
      {step === 0 && <>
        <Group label="Quel type de transport ?">
          <div className="qf-chips" role="radiogroup">
            {transportTypes.map((t, i) => <label key={t.value} className={`qf-chip${v.type === t.value ? ' is-on' : ''}`}>
              <input type="radio" name="type" value={t.value} checked={v.type === t.value} onChange={set('type')} required={i === 0} />
              <strong>{t.value}</strong><small>{t.hint}</small>
            </label>)}
          </div>
        </Group>
        <div className="qf-grid">
          <Field label="Nombre de passagers"><input type="number" inputMode="numeric" min={1} max={999} required value={v.passengers} onChange={set('passengers')} placeholder="Ex. 45" /></Field>
          <Group label="Type de trajet">
            <div className="qf-toggle">
              {([['return', 'Aller-retour'], ['one_way', 'Aller simple']] as const).map(([value, label]) =>
                <button type="button" key={value} className={v.journey === value ? 'is-on' : ''} aria-pressed={v.journey === value} onClick={() => setV(p => ({ ...p, journey: value }))}>{label}</button>)}
            </div>
          </Group>
        </div>
      </>}

      {step === 1 && <div className="qf-grid">
        <Field label="Date de départ"><input type="date" required min={today()} value={v.departDay} onChange={set('departDay')} /></Field>
        <Field label="Heure de départ"><input type="time" required value={v.departTime} onChange={set('departTime')} /></Field>
        {v.journey === 'return' && <>
          <Field label="Date de retour"><input type="date" required min={minReturn} value={v.returnDay} onChange={set('returnDay')} /></Field>
          <Field label="Heure de retour souhaitée"><input type="time" required value={v.returnTime} onChange={set('returnTime')} /></Field>
        </>}
        <Field label="Lieu de départ" wide><input required minLength={2} value={v.pickup} onChange={set('pickup')} placeholder="Adresse, école ou commune" autoComplete="street-address" /></Field>
        <Field label="Destination" wide><input required minLength={2} value={v.destination} onChange={set('destination')} placeholder="Ex. Pairi Daiza, Bruxelles, Paris…" /></Field>
      </div>}

      {step === 2 && <div className="qf-grid">
        <Field label="Nom et prénom"><input required minLength={2} value={v.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="École, société ou association" optional><input value={v.org} onChange={set('org')} autoComplete="organization" /></Field>
        <Field label="Adresse e-mail"><input type="email" required value={v.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Téléphone"><input type="tel" required minLength={6} value={v.phone} onChange={set('phone')} autoComplete="tel" placeholder="+32 …" /></Field>
        <Field label="Informations complémentaires" optional wide><textarea rows={4} maxLength={2500} value={v.notes} onChange={set('notes')} placeholder="Arrêts intermédiaires, horaires précis, bagages, personnes à mobilité réduite…" /></Field>
        {billing ? <>
          <Field label="Adresse de facturation" optional wide><input value={v.billingStreet} onChange={set('billingStreet')} placeholder="Rue et numéro" /></Field>
          <Field label="Code postal" optional><input value={v.billingPostal} onChange={set('billingPostal')} autoComplete="postal-code" /></Field>
          <Field label="Ville" optional><input value={v.billingCity} onChange={set('billingCity')} autoComplete="address-level2" /></Field>
          <Field label="Numéro de TVA" optional wide><input value={v.vat} onChange={set('vat')} placeholder="BE0…" /></Field>
        </> : <button type="button" className="qf-link qf-wide" onClick={() => setBilling(true)}>+ Ajouter une adresse de facturation</button>}
        <p className="qf-small qf-wide">Vos données servent uniquement à établir votre devis. Cette demande est gratuite et sans engagement.</p>
      </div>}
    </div>

    {create.isError && <p className="qf-error" role="alert">L’envoi n’a pas abouti. Vérifiez vos informations et réessayez, ou appelez-nous au <a href={phoneHref}>{phone}</a>.</p>}
    <div className="qf-nav">
      {step > 0 ? <button type="button" className="sc-btn sc-btn-outline" onClick={() => go(step - 1)}><ArrowLeft size={16} /> Retour</button> : <a className="qf-link" href={phoneHref}><Phone size={15} /> Plutôt par téléphone ?</a>}
      <button type="submit" className="sc-btn sc-btn-dark" disabled={create.isPending}>
        {step < 2 ? <>Continuer <ArrowRight size={16} /></> : create.isPending ? 'Envoi en cours…' : <>Envoyer ma demande <ArrowRight size={16} /></>}
      </button>
    </div>
  </form></div>;
}

function Field({ label, optional, wide, children }: { label: string; optional?: boolean; wide?: boolean; children: ReactNode }) {
  return <label className={`qf-field${wide ? ' qf-wide' : ''}`}><span>{label}{optional && <em> facultatif</em>}</span>{children}</label>;
}
function Group({ label, children }: { label: string; children: ReactNode }) {
  return <fieldset className="qf-group"><legend>{label}</legend>{children}</fieldset>;
}
