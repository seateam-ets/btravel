import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { createContactMessage } from '@workspace/api-client-react';
import type { ContactMessageInput } from '@workspace/api-client-react';

function errorText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const message = (error as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof message === 'string') return message;
  if (status === 429) return 'Trop de messages envoyés. Réessayez dans quelques minutes.';
  if (!status) return 'Connexion impossible. Vérifiez votre connexion internet puis réessayez.';
  return 'L’envoi n’a pas abouti. Réessayez dans un instant.';
}

const subjects = ['Question générale', 'Voyages organisés', 'Transport régulier', 'Facturation', 'Autre'];

/** Formulaire de contact simple : arrive dans Admin → Demandes de contact. */
export function ContactForm({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const [v, setV] = useState<ContactMessageInput>({ name: '', email: '', phone: '', subject: subjects[0], message: '' });
  const send = useMutation({ mutationFn: (data: ContactMessageInput) => createContactMessage(data) });
  const set = (key: keyof ContactMessageInput) => (e: { target: { value: string } }) => setV(prev => ({ ...prev, [key]: e.target.value }));

  if (send.isSuccess) return <div className="qf qf-done" role="status">
    <span className="qf-done-icon"><Check /></span>
    <h3>Merci, votre message est bien envoyé.</h3>
    <p>Notre équipe vous répond rapidement par e-mail ou par téléphone.</p>
    <p className="qf-small">Pour une demande urgente : <a href={phoneHref}>{phone}</a>.</p>
  </div>;

  return <form className="qf cf" onSubmit={e => {
    e.preventDefault();
    send.mutate({ ...v, name: v.name.trim(), email: v.email.trim(), phone: v.phone?.trim() || undefined, message: v.message.trim() });
  }}>
    <div className="qf-grid">
      <label className="qf-field"><span>Nom et prénom</span><input required minLength={2} maxLength={120} value={v.name} onChange={set('name')} autoComplete="name" /></label>
      <label className="qf-field"><span>Adresse e-mail</span><input type="email" required value={v.email} onChange={set('email')} autoComplete="email" /></label>
      <label className="qf-field"><span>Téléphone<em> facultatif</em></span><input type="tel" maxLength={40} value={v.phone} onChange={set('phone')} autoComplete="tel" placeholder="+32 …" /></label>
      <label className="qf-field"><span>Sujet</span><select value={v.subject} onChange={set('subject')}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="qf-field qf-wide"><span>Votre message</span><textarea required minLength={5} maxLength={4000} rows={6} value={v.message} onChange={set('message')} /></label>
    </div>
    {send.isError && <p className="qf-error" role="alert">{errorText(send.error)} Vous pouvez aussi nous appeler au <a href={phoneHref}>{phone}</a>.</p>}
    <div className="qf-nav">
      <p className="qf-small">Vos coordonnées servent uniquement à vous répondre.</p>
      <button type="submit" className="sc-btn sc-btn-dark" disabled={send.isPending}>{send.isPending ? 'Envoi en cours…' : <>Envoyer le message <ArrowRight size={16} /></>}</button>
    </div>
  </form>;
}
