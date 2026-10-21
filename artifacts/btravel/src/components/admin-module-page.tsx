import { useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCheckScheduleConflicts,
  useCreateClient,
  useCreateDocument,
  useCreateDriver,
  useCreateInvoice,
  useCreateManualQuoteRequest,
  useCreatePassenger,
  useCreateQuote,
  useCreateRecurringRoute,
  useCreateTask,
  useCreateTransport,
  useCreateTrip,
  useCreateVehicle,
  useGetClientHistory,
  useGetInvoiceSettings,
  useIssueInvoice,
  useListAdminTrips,
  useListClients,
  useListDocuments,
  useListDrivers,
  useListInvoices,
  useListPassengers,
  useListQuoteRequests,
  useListQuotes,
  useListRecurringRoutes,
  useListScheduleOccurrences,
  useListTasks,
  useListTransports,
  useListTripRequests,
  useListVehicles,
  useRecordPayment,
  useRecordQuoteDecision,
  useRequestUploadUrl,
  useUpdateClient,
  useUpdateDriver,
  useUpdateInvoiceSettings,
  useUpdateQuoteRequestStatus,
  useUpdateQuoteStatus,
  useUpdateRecurringRoute,
  useUpdateTask,
  useUpdateTransport,
  useUpdateTrip,
  useUpdateTripRequestStatus,
  useUpdateVehicle,
  useConvertQuoteToTransport,
  getMissionSheet,
  getListAdminTripsQueryKey,
  getListClientsQueryKey,
  getListDocumentsQueryKey,
  getListDriversQueryKey,
  getListInvoicesQueryKey,
  getListPassengersQueryKey,
  getListQuoteRequestsQueryKey,
  getListQuotesQueryKey,
  getListRecurringRoutesQueryKey,
  getListScheduleOccurrencesQueryKey,
  getListTasksQueryKey,
  getListTransportsQueryKey,
  getListTripRequestsQueryKey,
  getListVehiclesQueryKey,
  getGetInvoiceSettingsQueryKey,
  getGetClientHistoryQueryKey,
  type Client,
  type DateTimeRange,
  type AdminTrip,
  type Invoice,
  type RecurringRoute,
  type Transport,
  type TransportUpdate,
  type TripRequest,
  type TripUpdate,
  type Vehicle,
  type Driver,
} from "@workspace/api-client-react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type Row = Record<string, unknown>;
type QueryKey = readonly unknown[];
type ShellProps = { children: ReactNode; title: string };
type Shell = ComponentType<ShellProps>;
type ModuleProps = {
  path: string;
  title: string;
  subtitle: string;
  columns: string[];
  Shell: Shell;
};

const WEEKDAYS = [
  ["1", "Lun"],
  ["2", "Mar"],
  ["3", "Mer"],
  ["4", "Jeu"],
  ["5", "Ven"],
  ["6", "Sam"],
  ["7", "Dim"],
] as const;

const formatDate = (value: unknown): string => {
  if (!value) return "—";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const formatDateTime = (value: unknown): string => {
  if (!value) return "—";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const formatMoney = (cents: unknown): string => {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
};

function localDateTimeToIso(value: string): string {
  const [day, time] = value.split("T");
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, date, hour, minute);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desiredAsUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return new Date(desiredAsUtc - (representedAsUtc - desiredAsUtc)).toISOString();
}

function isoToLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function printPage(title: string, body: string): void {
  const target = window.open("", "_blank");
  if (!target) return;
  target.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font:15px Arial,sans-serif;color:#18344d;margin:36px auto;max-width:780px;line-height:1.55}
    h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:26px 0 8px}
    .muted{color:#5b6d7c}.row{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #ddd;padding:10px 0}
    .total{font-weight:700;font-size:20px;margin-top:18px}.brand{font-size:13px;letter-spacing:.15em;color:#365899}
    @media print{body{margin:12mm auto}}
  </style></head><body>${body}<script>window.addEventListener('load',()=>window.print())</script></body></html>`);
  target.document.close();
}

function todayString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function rangeForView(view: "day" | "week" | "month", dateValue: string) {
  const selected = new Date(`${dateValue}T12:00:00Z`);
  if (view === "day") return { from: dateValue, to: dateValue };
  if (view === "week") {
    const day = selected.getUTCDay() || 7;
    selected.setUTCDate(selected.getUTCDate() - day + 1);
    const from = selected.toISOString().slice(0, 10);
    selected.setUTCDate(selected.getUTCDate() + 6);
    return { from, to: selected.toISOString().slice(0, 10) };
  }
  selected.setUTCDate(1);
  const from = selected.toISOString().slice(0, 10);
  selected.setUTCMonth(selected.getUTCMonth() + 1, 0);
  return { from, to: selected.toISOString().slice(0, 10) };
}

function getText(row: Row, key: string): string {
  const value = row[key];
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function statusLabel(value: unknown): string {
  const labels: Record<string, string> = {
    new: "Nouvelle",
    processing: "En cours",
    quoted: "Devis envoyé",
    closed: "Clôturée",
    draft: "Brouillon",
    sent: "Envoyé",
    accepted: "Accepté",
    declined: "Refusé",
    expired: "Expiré",
    planned: "Planifié",
    confirmed: "Confirmé",
    completed: "Terminé",
    cancelled: "Annulé",
    pending: "À confirmer",
    unpaid: "À régler",
    partial: "Partiel",
    paid: "Réglé",
    published: "Publié",
    archived: "Archivé",
    active: "Actif",
    inactive: "Inactif",
    partially_paid: "Partiellement réglée",
    true: "Actif",
    false: "Inactif",
  };
  return labels[String(value)] ?? String(value ?? "—");
}

function Field({ children, full = false, className = "" }: { children: ReactNode; full?: boolean; className?: string }) {
  return <label className={[full ? "span-all" : "", className].filter(Boolean).join(" ")}>{children}</label>;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return <div className="form-error" role="alert"><CircleAlert size={16} />{children}</div>;
}

function SuccessMessage({ children }: { children: ReactNode }) {
  return <div className="success-box" role="status"><Check size={18} />{children}</div>;
}

function ClientHistoryPanel({ clientId }: { clientId: string }) {
  const history = useGetClientHistory(clientId);
  if (history.isLoading) return <div className="inline-detail">Chargement de l’historique…</div>;
  if (history.isError || !history.data) return <div className="inline-detail">L’historique du client n’est pas disponible.</div>;
  const { requests, quotes, transports, invoices } = history.data;
  return (
    <div className="inline-detail history-grid">
      <div><strong>Demandes</strong><span>{requests.length}</span></div>
      <div><strong>Devis</strong><span>{quotes.length}</span></div>
      <div><strong>Transports</strong><span>{transports.length}</span></div>
      <div><strong>Factures</strong><span>{invoices.length}</span></div>
      <div className="span-all history-list">
        {[...requests.map((row) => ({ kind: "Demande", reference: row.reference, date: row.createdAt })), ...quotes.map((row) => ({ kind: "Devis", reference: row.reference, date: row.createdAt })), ...transports.map((row) => ({ kind: "Transport", reference: row.reference, date: row.startAt })), ...invoices.map((row) => ({ kind: "Facture", reference: row.reference, date: row.createdAt }))].map((item) => (
          <span key={`${item.kind}-${item.reference}`}><b>{item.kind}</b> {item.reference} · {formatDate(item.date)}</span>
        ))}
      </div>
    </div>
  );
}

function BookingActions({ booking, onChanged }: { booking: TripRequest; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const passengers = useListPassengers(booking.id, {
    query: {
      enabled: expanded && booking.status === "confirmed",
      queryKey: getListPassengersQueryKey(booking.id),
    },
  });
  const createPassenger = useCreatePassenger();
  const recordPayment = useRecordPayment();
  const addPassenger = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createPassenger.mutateAsync({
      id: booking.id,
      data: { name: String(form.get("name")), note: String(form.get("note") || "") },
    });
    event.currentTarget.reset();
    await passengers.refetch();
    onChanged();
  };
  const addPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPaymentError("");
    try {
      await recordPayment.mutateAsync({
        data: {
          targetType: "trip_request",
          targetId: booking.id,
          amountCents: Math.round(Number(form.get("amount")) * 100),
          paidAt: new Date().toISOString(),
          note: String(form.get("note") || ""),
        },
      });
      onChanged();
    } catch {
      setPaymentError("Le paiement n’a pas pu être enregistré. Vérifiez le solde restant.");
    }
  };
  return (
    <div className="row-actions">
      {booking.status === "confirmed" && (
        <button className="text-link" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Fermer le dossier" : "Passagers et paiements"}
        </button>
      )}
      {expanded && booking.status === "confirmed" && (
        <div className="row-action-details">
          <strong>Passagers ({passengers.data?.length ?? 0}/{booking.seatCount})</strong>
          {passengers.data?.map((person) => <span key={person.id}>{person.name}{person.note ? ` · ${person.note}` : ""}</span>)}
          {(passengers.data?.length ?? 0) < booking.seatCount && (
            <form className="compact-form" onSubmit={addPassenger}>
              <input name="name" placeholder="Nom du passager" minLength={2} required aria-label="Nom du passager" />
              <input name="note" placeholder="Précision facultative" aria-label="Précision facultative" />
              <button className="button button-outline" disabled={createPassenger.isPending}>Ajouter</button>
            </form>
          )}
          <form className="compact-form" onSubmit={addPayment}>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="Montant reçu (€)" required aria-label="Montant reçu en euros" />
            <input name="note" placeholder="Mode ou référence" aria-label="Mode ou référence du paiement" />
            <button className="button button-outline" disabled={recordPayment.isPending}>Enregistrer le paiement</button>
          </form>
          {paymentError && <ErrorMessage>{paymentError}</ErrorMessage>}
        </div>
      )}
    </div>
  );
}

function TransportMissionButton({ id }: { id: string }) {
  const [error, setError] = useState("");
  const printMission = async () => {
    setError("");
    const target = window.open("", "_blank");
    if (!target) {
      setError("Autorisez l’ouverture de la fiche pour l’imprimer.");
      return;
    }
    try {
      const sheet = await getMissionSheet(id);
      const fields = [
        ["Client", sheet.clientName],
        ["Départ", formatDateTime(sheet.startAt)],
        ["Fin prévue", formatDateTime(sheet.endAt)],
        ["Prise en charge", sheet.pickupAddress],
        ["Destination", sheet.destination],
        ["Passagers", sheet.passengerCount],
        ["Véhicule", sheet.vehicleName || "À affecter"],
        ["Immatriculation", sheet.registration || "À affecter"],
        ["Chauffeur", sheet.driverName || "À affecter"],
        ["Notes", sheet.notes || "—"],
      ];
      target.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche ${escapeHtml(sheet.reference)}</title><style>body{font:15px Arial;color:#18344d;max-width:780px;margin:35px auto}h1{font-size:28px}.row{padding:12px 0;border-bottom:1px solid #ddd;display:grid;grid-template-columns:180px 1fr}.label{color:#607080}</style></head><body><p>B-TRAVEL · FICHE DE MISSION</p><h1>${escapeHtml(sheet.reference)}</h1>${fields.map(([label, value]) => `<div class="row"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}<script>window.addEventListener('load',()=>window.print())</script></body></html>`);
      target.document.close();
    } catch {
      target.close();
      setError("La fiche de mission n’a pas pu être préparée.");
    }
  };
  return <span className="print-action"><button className="text-link" onClick={printMission}><Printer size={15}/>Fiche de mission</button>{error && <span className="form-error">{error}</span>}</span>;
}

function TransportEdit({ transport, vehicles, drivers, onSave }: {
  transport?: Transport;
  vehicles: Vehicle[];
  drivers: Driver[];
  onSave: (data: TransportUpdate) => Promise<void>;
}) {
  const [error, setError] = useState("");
  if (!transport) return null;
  return <details className="row-edit"><summary>Modifier le planning</summary><form className="compact-form" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startAt = localDateTimeToIso(String(form.get("startAt")));
    const endAt = localDateTimeToIso(String(form.get("endAt")));
    if (Date.parse(startAt) >= Date.parse(endAt)) {
      setError("La fin doit suivre l’heure de départ.");
      return;
    }
    try {
      await onSave({
        startAt,
        endAt,
        vehicleId: String(form.get("vehicleId") || "") || null,
        driverId: String(form.get("driverId") || "") || null,
        notes: String(form.get("notes") || ""),
      });
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Le planning n’a pas pu être modifié.");
    }
  }}>
    <input name="startAt" type="datetime-local" defaultValue={isoToLocalDateTime(transport.startAt)} required aria-label="Début du transport"/>
    <input name="endAt" type="datetime-local" defaultValue={isoToLocalDateTime(transport.endAt)} required aria-label="Fin du transport"/>
    <select name="vehicleId" defaultValue={transport.vehicleId ?? ""} aria-label="Véhicule"><option value="">Aucun véhicule</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.capacity} places</option>)}</select>
    <select name="driverId" defaultValue={transport.driverId ?? ""} aria-label="Chauffeur"><option value="">Aucun chauffeur</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select>
    <input name="notes" defaultValue={transport.notes ?? ""} placeholder="Notes de mission" aria-label="Notes de mission"/>
    <button className="button button-outline">Enregistrer</button>
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </form></details>;
}

function TripEdit({ trip, onSave }: {
  trip: AdminTrip;
  onSave: (data: TripUpdate) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return <details className="row-edit"><summary>Modifier le voyage</summary><form className="compact-form" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        title: String(form.get("title")),
        description: String(form.get("description")),
        program: String(form.get("program") || "") || null,
        priceCents: Math.round(Number(form.get("price")) * 100),
        capacity: Number(form.get("capacity")),
      });
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Le voyage n’a pas pu être modifié.");
    }
  }}>
    <input name="title" defaultValue={trip.title} required aria-label="Titre du voyage"/>
    <input name="price" type="number" min="0" step="0.01" defaultValue={(trip.priceCents / 100).toFixed(2)} required aria-label="Prix en euros"/>
    <input name="capacity" type="number" min="1" defaultValue={trip.capacity} required aria-label="Capacité"/>
    <textarea name="description" defaultValue={trip.description} required rows={2} aria-label="Description"/>
    <textarea name="program" defaultValue={trip.program ?? ""} rows={2} aria-label="Programme"/>
    <button className="button button-outline">Enregistrer</button>
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </form></details>;
}

const FWB_SCHOOL_HOLIDAYS = [
  { startDate: "2026-10-19", endDate: "2026-11-01" },
  { startDate: "2026-12-21", endDate: "2027-01-03" },
  { startDate: "2027-02-22", endDate: "2027-03-07" },
  { startDate: "2027-04-26", endDate: "2027-05-09" },
  { startDate: "2027-07-03", endDate: "2027-08-29" },
  { startDate: "2027-10-25", endDate: "2027-11-07" },
  { startDate: "2027-12-27", endDate: "2028-01-09" },
  { startDate: "2028-02-28", endDate: "2028-03-12" },
  { startDate: "2028-05-01", endDate: "2028-05-14" },
  { startDate: "2028-07-08", endDate: "2028-08-27" },
];

function AdminModulePage({ path, title, subtitle, columns, Shell }: ModuleProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [scheduleView, setScheduleView] = useState<"day" | "week" | "month">("week");
  const [scheduleDate, setScheduleDate] = useState(todayString());
  const [excludedRoute, setExcludedRoute] = useState("");

  const scheduleRange = useMemo(
    () => rangeForView(scheduleView, scheduleDate),
    [scheduleView, scheduleDate],
  );

  const clients = useListClients(undefined, { query: { enabled: ["/admin/clients", "/admin/transports", "/admin/factures", "/admin/documents"].includes(path), queryKey: getListClientsQueryKey() } });
  const requests = useListQuoteRequests(undefined, { query: { enabled: ["/admin/demandes", "/admin/devis", "/admin/documents"].includes(path), queryKey: getListQuoteRequestsQueryKey() } });
  const quotes = useListQuotes({ query: { enabled: path === "/admin/devis" || path === "/admin/documents", queryKey: getListQuotesQueryKey() } });
  const transports = useListTransports(undefined, { query: { enabled: path === "/admin/transports" || path === "/admin/factures" || path === "/admin/documents", queryKey: getListTransportsQueryKey() } });
  const occurrences = useListScheduleOccurrences(scheduleRange, { query: { enabled: path === "/admin/transports", queryKey: getListScheduleOccurrencesQueryKey(scheduleRange) } });
  const recurringRoutes = useListRecurringRoutes({ query: { enabled: path === "/admin/trajets-recurrents", queryKey: getListRecurringRoutesQueryKey() } });
  const vehicles = useListVehicles({ query: { enabled: ["/admin/vehicules", "/admin/transports", "/admin/trajets-recurrents"].includes(path), queryKey: getListVehiclesQueryKey() } });
  const drivers = useListDrivers({ query: { enabled: ["/admin/chauffeurs", "/admin/transports", "/admin/trajets-recurrents"].includes(path), queryKey: getListDriversQueryKey() } });
  const adminTrips = useListAdminTrips({ query: { enabled: path === "/admin/voyages" || path === "/admin/inscriptions" || path === "/admin/documents", queryKey: getListAdminTripsQueryKey() } });
  const bookings = useListTripRequests({ query: { enabled: path === "/admin/inscriptions" || path === "/admin/documents", queryKey: getListTripRequestsQueryKey() } });
  const invoices = useListInvoices({ query: { enabled: path === "/admin/factures" || path === "/admin/documents", queryKey: getListInvoicesQueryKey() } });
  const invoiceSettings = useGetInvoiceSettings({ query: { enabled: path === "/admin/factures", queryKey: getGetInvoiceSettingsQueryKey() } });
  const documents = useListDocuments({ query: { enabled: path === "/admin/documents", queryKey: getListDocumentsQueryKey() } });
  const tasks = useListTasks({ query: { enabled: path === "/admin/taches", queryKey: getListTasksQueryKey() } });
  const clientHistory = useGetClientHistory(selectedClient, { query: { enabled: Boolean(selectedClient), queryKey: getGetClientHistoryQueryKey(selectedClient) } });

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createManualRequest = useCreateManualQuoteRequest();
  const updateRequestStatus = useUpdateQuoteRequestStatus();
  const createQuote = useCreateQuote();
  const updateQuoteStatus = useUpdateQuoteStatus();
  const recordQuoteDecision = useRecordQuoteDecision();
  const convertQuote = useConvertQuoteToTransport();
  const createTransport = useCreateTransport();
  const checkSchedule = useCheckScheduleConflicts();
  const updateTransport = useUpdateTransport();
  const createRecurringRoute = useCreateRecurringRoute();
  const updateRecurringRoute = useUpdateRecurringRoute();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const updateBooking = useUpdateTripRequestStatus();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createInvoice = useCreateInvoice();
  const issueInvoice = useIssueInvoice();
  const updateInvoiceSettings = useUpdateInvoiceSettings();
  const recordPayment = useRecordPayment();
  const requestUploadUrl = useRequestUploadUrl();
  const createDocument = useCreateDocument();
  const createPassenger = useCreatePassenger();

  const invalidate = (...keys: QueryKey[]) => {
    keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
  };
  const onSuccess = (message: string, ...keys: QueryKey[]) => {
    setError("");
    setNotice(message);
    setShowForm(false);
    invalidate(...keys);
  };
  const onFailure = (message = "L’enregistrement a échoué. Vérifiez les données et réessayez.") => {
    setNotice("");
    setError(message);
  };

  const rawData: Row[] = (
    path === "/admin/demandes" ? requests.data :
    path === "/admin/devis" ? quotes.data :
    path === "/admin/clients" ? clients.data :
    path === "/admin/transports" ? transports.data :
    path === "/admin/trajets-recurrents" ? recurringRoutes.data :
    path === "/admin/vehicules" ? vehicles.data :
    path === "/admin/chauffeurs" ? drivers.data :
    path === "/admin/voyages" ? adminTrips.data :
    path === "/admin/inscriptions" ? bookings.data :
    path === "/admin/factures" ? invoices.data :
    path === "/admin/documents" ? documents.data :
    path === "/admin/taches" ? tasks.data : []
  ) as unknown as Row[] | undefined ?? [];

  const filtered = rawData.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(search.toLowerCase().trim()),
  );

  const queryLoading =
    path === "/admin/demandes" ? requests.isLoading :
    path === "/admin/devis" ? requests.isLoading || quotes.isLoading :
    path === "/admin/clients" ? clients.isLoading :
    path === "/admin/transports" ? occurrences.isLoading || transports.isLoading :
    path === "/admin/trajets-recurrents" ? recurringRoutes.isLoading :
    path === "/admin/vehicules" ? vehicles.isLoading :
    path === "/admin/chauffeurs" ? drivers.isLoading :
    path === "/admin/voyages" ? adminTrips.isLoading :
    path === "/admin/inscriptions" ? bookings.isLoading :
    path === "/admin/factures" ? invoices.isLoading || invoiceSettings.isLoading :
    path === "/admin/documents" ? documents.isLoading :
    path === "/admin/taches" ? tasks.isLoading : false;

  const queryError =
    path === "/admin/demandes" ? requests.isError :
    path === "/admin/devis" ? requests.isError || quotes.isError :
    path === "/admin/clients" ? clients.isError :
    path === "/admin/transports" ? occurrences.isError || transports.isError :
    path === "/admin/trajets-recurrents" ? recurringRoutes.isError :
    path === "/admin/vehicules" ? vehicles.isError :
    path === "/admin/chauffeurs" ? drivers.isError :
    path === "/admin/voyages" ? adminTrips.isError :
    path === "/admin/inscriptions" ? bookings.isError :
    path === "/admin/factures" ? invoices.isError || invoiceSettings.isError :
    path === "/admin/documents" ? documents.isError :
    path === "/admin/taches" ? tasks.isError : false;

  const refreshKey = (): QueryKey => {
    if (path === "/admin/demandes") return getListQuoteRequestsQueryKey();
    if (path === "/admin/devis") return getListQuotesQueryKey();
    if (path === "/admin/clients") return getListClientsQueryKey();
    if (path === "/admin/transports") return getListTransportsQueryKey();
    if (path === "/admin/trajets-recurrents") return getListRecurringRoutesQueryKey();
    if (path === "/admin/vehicules") return getListVehiclesQueryKey();
    if (path === "/admin/chauffeurs") return getListDriversQueryKey();
    if (path === "/admin/voyages") return getListAdminTripsQueryKey();
    if (path === "/admin/inscriptions") return getListTripRequestsQueryKey();
    if (path === "/admin/factures") return getListInvoicesQueryKey();
    if (path === "/admin/documents") return getListDocumentsQueryKey();
    return getListTasksQueryKey();
  };

  const createSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      if (path === "/admin/clients") {
        await createClient.mutateAsync({
          data: {
            name: String(form.get("name")),
            organizationName: String(form.get("organization") || ""),
            email: String(form.get("email")),
            phone: String(form.get("phone")),
            address: String(form.get("address") || ""),
          },
        });
        onSuccess("Client enregistré.", getListClientsQueryKey());
      } else if (path === "/admin/demandes") {
        const journeyType = String(form.get("journey")) as "one_way" | "return";
        const returnAt = String(form.get("return") || "");
        await createManualRequest.mutateAsync({
          data: {
            contactName: String(form.get("name")),
            organizationName: String(form.get("organization") || ""),
            email: String(form.get("email")),
            phone: String(form.get("phone")),
            transportType: String(form.get("type")),
            journeyType,
            departureAt: localDateTimeToIso(String(form.get("depart"))),
            returnAt: returnAt ? localDateTimeToIso(returnAt) : undefined,
            pickupAddress: String(form.get("pickup")),
            destination: String(form.get("destination")),
            passengerCount: Number(form.get("passengers")),
            notes: String(form.get("notes") || ""),
          },
        });
        onSuccess("Demande ajoutée.", getListQuoteRequestsQueryKey());
      } else if (path === "/admin/devis") {
        await createQuote.mutateAsync({
          data: {
            requestId: String(form.get("requestId")),
            totalCents: Math.round(Number(form.get("amount")) * 100),
            validUntil: String(form.get("validUntil") || "") || undefined,
            notes: String(form.get("notes") || ""),
          },
        });
        onSuccess("Devis créé.", getListQuotesQueryKey());
      } else if (path === "/admin/transports") {
        const startAt = localDateTimeToIso(String(form.get("startAt")));
        const endAt = localDateTimeToIso(String(form.get("endAt")));
        const vehicleId = String(form.get("vehicleId") || "");
        const driverId = String(form.get("driverId") || "");
        const data = {
          clientName: String(form.get("clientName")),
          clientId: String(form.get("clientId") || "") || undefined,
          startAt,
          endAt,
          pickupAddress: String(form.get("pickup")),
          destination: String(form.get("destination")),
          passengerCount: Number(form.get("passengers")),
          vehicleId: vehicleId || undefined,
          driverId: driverId || undefined,
          notes: String(form.get("notes") || "") || undefined,
        };
        const availability = await checkSchedule.mutateAsync({
          data: {
            startAt,
            endAt,
            passengerCount: data.passengerCount,
            vehicleId: vehicleId || undefined,
            driverId: driverId || undefined,
          },
        });
        if (availability.capacityExceeded || availability.conflicts.length) {
          onFailure(availability.conflicts.join(" ") || "Le véhicule ne peut pas accueillir tous les passagers.");
          return;
        }
        await createTransport.mutateAsync({ data });
        onSuccess("Transport planifié.", getListTransportsQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange));
      } else if (path === "/admin/trajets-recurrents") {
        const weekdays = form.getAll("weekdays").map((value) => Number(value));
        await createRecurringRoute.mutateAsync({
          data: {
            name: String(form.get("name")),
            clientName: String(form.get("clientName")),
            startDate: String(form.get("startDate")),
            endDate: String(form.get("endDate")),
            startTime: String(form.get("startTime")),
            endTime: String(form.get("endTime")),
            weekdays,
            pickupAddress: String(form.get("pickup")),
            destination: String(form.get("destination")),
            passengerCount: Number(form.get("passengers")),
            vehicleId: String(form.get("vehicleId") || "") || undefined,
            driverId: String(form.get("driverId") || "") || undefined,
            excludedRanges: FWB_SCHOOL_HOLIDAYS,
          },
        });
        onSuccess("Trajet récurrent ajouté.", getListRecurringRoutesQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange));
      } else if (path === "/admin/vehicules") {
        await createVehicle.mutateAsync({
          data: {
            name: String(form.get("name")),
            registration: String(form.get("registration")),
            capacity: Number(form.get("capacity")),
            equipment: String(form.get("equipment") || "").split(",").map((value) => value.trim()).filter(Boolean),
            unavailableIntervals: [],
          },
        });
        onSuccess("Véhicule enregistré.", getListVehiclesQueryKey());
      } else if (path === "/admin/chauffeurs") {
        await createDriver.mutateAsync({
          data: {
            name: String(form.get("name")),
            phone: String(form.get("phone")),
            email: String(form.get("email") || "") || undefined,
            unavailableIntervals: [],
          },
        });
        onSuccess("Chauffeur enregistré.", getListDriversQueryKey());
      } else if (path === "/admin/voyages") {
        const slug = String(form.get("slug")).trim().toLowerCase();
        await createTrip.mutateAsync({
          data: {
            slug,
            title: String(form.get("title")),
            destination: String(form.get("destination")),
            startDate: String(form.get("startDate")),
            endDate: String(form.get("endDate")),
            priceCents: Math.round(Number(form.get("price")) * 100),
            capacity: Number(form.get("capacity")),
            description: String(form.get("description")),
            program: String(form.get("program") || "") || undefined,
            departurePoints: String(form.get("departurePoints") || "").split(",").map((value) => value.trim()).filter(Boolean),
            imageUrl: String(form.get("imageUrl") || "") || undefined,
            visibility: String(form.get("visibility")) as "draft" | "published" | "archived",
          },
        });
        onSuccess("Voyage enregistré.", getListAdminTripsQueryKey());
      } else if (path === "/admin/factures") {
        await createInvoice.mutateAsync({
          data: {
            clientName: String(form.get("clientName")),
            clientId: String(form.get("clientId") || "") || undefined,
            transportId: String(form.get("transportId") || "") || undefined,
            totalCents: Math.round(Number(form.get("amount")) * 100),
            dueDate: String(form.get("dueDate") || "") || undefined,
          },
        });
        onSuccess("Brouillon de facture créé.", getListInvoicesQueryKey());
      } else if (path === "/admin/taches") {
        await createTask.mutateAsync({
          data: {
            title: String(form.get("title")),
            category: String(form.get("category") || "") || undefined,
            dueAt: String(form.get("due") || "") || undefined,
          },
        });
        onSuccess("Tâche ajoutée.", getListTasksQueryKey());
      }
    } catch {
      onFailure();
    }
  };

  const pending =
    createClient.isPending || createManualRequest.isPending || createQuote.isPending ||
    createTransport.isPending || checkSchedule.isPending || createRecurringRoute.isPending ||
    createVehicle.isPending || createDriver.isPending || createTrip.isPending ||
    createInvoice.isPending || createTask.isPending;

  const selectedRequestOptions = requests.data?.filter((request) => request.status !== "closed") ?? [];
  const activeVehicles = vehicles.data?.filter((vehicle) => vehicle.active) ?? [];
  const activeDrivers = drivers.data?.filter((driver) => driver.active) ?? [];
  const toEntityOptions = (items: unknown[] | undefined, labelKey: string, fallbackKey = "reference") =>
    ((items ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      label: String(row[labelKey] ?? row[fallbackKey] ?? row.id),
    }));
  const documentEntities: Record<string, { id: string; label: string }[]> = {
    client: toEntityOptions(clients.data, "name", "email"),
    quote_request: toEntityOptions(requests.data, "contactName"),
    quote: toEntityOptions(quotes.data, "reference"),
    transport: toEntityOptions(transports.data, "clientName"),
    trip: toEntityOptions(adminTrips.data, "title"),
    trip_request: toEntityOptions(bookings.data, "tripTitle"),
    invoice: toEntityOptions(invoices.data, "clientName"),
  };

  const updateRequest = async (id: string, status: string) => {
    try {
      await updateRequestStatus.mutateAsync({ id, data: { status: status as "new" | "processing" | "quoted" | "closed" } });
      invalidate(getListQuoteRequestsQueryKey());
    } catch { onFailure("Le statut de la demande n’a pas pu être modifié."); }
  };

  const rowActions = (row: Row) => {
    const id = String(row.id);
    if (path === "/admin/demandes") {
      return <div className="row-actions"><select aria-label="Statut de la demande" value={String(row.status)} onChange={(event) => void updateRequest(id, event.target.value)}><option value="new">Nouvelle</option><option value="processing">En cours</option><option value="quoted">Devis envoyé</option><option value="closed">Clôturée</option></select><RequestDetails row={row}/></div>;
    }
    if (path === "/admin/devis") {
      const status = String(row.status);
      const accepted = status === "accepted";
      return <div className="row-actions">
        {status === "draft" && <button className="text-link" onClick={async () => { try { await updateQuoteStatus.mutateAsync({ id, data: { status: "sent" } }); invalidate(getListQuotesQueryKey()); } catch { onFailure(); } }}>Marquer envoyé</button>}
        {status === "sent" && <>
          <button className="text-link" onClick={async () => { if (!window.confirm("Confirmez-vous que le client a accepté ce devis ?")) return; try { await recordQuoteDecision.mutateAsync({ id, data: { decision: "accepted", receivedAt: new Date().toISOString() } }); invalidate(getListQuotesQueryKey()); } catch { onFailure(); } }}>Le client accepte</button>
          <button className="text-link" onClick={async () => { if (!window.confirm("Confirmez-vous que le client a refusé ce devis ?")) return; try { await recordQuoteDecision.mutateAsync({ id, data: { decision: "declined", receivedAt: new Date().toISOString() } }); invalidate(getListQuotesQueryKey()); } catch { onFailure(); } }}>Le client refuse</button>
        </>}
        {accepted && <button className="text-link" onClick={async () => { try { await convertQuote.mutateAsync({ id }); invalidate(getListQuotesQueryKey(), getListTransportsQueryKey()); setNotice("Transport créé à partir du devis accepté."); } catch { onFailure("Le devis n’a pas pu être converti en transport."); } }}>Créer le transport</button>}
        <button className="text-link" onClick={() => printPage(`Devis ${getText(row, "reference")}`, `<p class="brand">B-TRAVEL · DEVIS</p><h1>${escapeHtml(row.reference)}</h1><div class="row"><span>Demande</span><strong>${escapeHtml(row.requestReference || row.requestId)}</strong></div><div class="row"><span>Client</span><strong>${escapeHtml(row.clientName || "—")}</strong></div><div class="row"><span>E-mail</span><strong>${escapeHtml(row.email || "—")}</strong></div><div class="row"><span>Trajet</span><strong>${escapeHtml(row.pickupAddress || "—")} → ${escapeHtml(row.destination || "—")}</strong></div><div class="row"><span>Départ souhaité</span><strong>${escapeHtml(formatDateTime(row.departureAt))}</strong></div><div class="row"><span>Montant</span><strong>${escapeHtml(formatMoney(row.totalCents))}</strong></div><div class="row"><span>Valable jusqu’au</span><strong>${escapeHtml(formatDate(row.validUntil))}</strong></div><p>${escapeHtml(row.notes || "")}</p>`)}><Printer size={15}/>Imprimer</button>
      </div>;
    }
    if (path === "/admin/clients") {
      const client = row as unknown as Client;
      return <div className="row-actions"><button className="text-link" onClick={() => setSelectedClient(selectedClient === id ? "" : id)}>{selectedClient === id ? "Fermer l’historique" : "Historique"}</button><details className="row-edit"><summary>Modifier</summary><form className="compact-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await updateClient.mutateAsync({ id, data: { name: String(form.get("name")), organizationName: String(form.get("organization") || ""), email: String(form.get("email")), phone: String(form.get("phone")), address: String(form.get("address") || "") } }); invalidate(getListClientsQueryKey()); setNotice("Client modifié."); } catch { onFailure(); } }}><input name="name" defaultValue={client.name} required aria-label="Nom du client"/><input name="organization" defaultValue={client.organizationName ?? ""} placeholder="Organisation" aria-label="Organisation"/><input name="email" type="email" defaultValue={client.email} required aria-label="E-mail"/><input name="phone" defaultValue={client.phone} required aria-label="Téléphone"/><input name="address" defaultValue={client.address ?? ""} placeholder="Adresse" aria-label="Adresse"/><button className="button button-outline">Enregistrer</button></form></details></div>;
    }
    if (path === "/admin/transports") {
      const transport = transports.data?.find((item) => item.id === id);
      return <div className="row-actions">{transport && <TransportMissionButton id={id}/>}<select aria-label="Statut du transport" value={String(transport?.status ?? row.status)} onChange={async (event) => { try { await updateTransport.mutateAsync({ id, data: { status: event.target.value as "planned" | "confirmed" | "completed" | "cancelled" } }); invalidate(getListTransportsQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange)); } catch { onFailure("Le statut du transport n’a pas pu être modifié."); } }}><option value="planned">Planifié</option><option value="confirmed">Confirmé</option><option value="completed">Terminé</option><option value="cancelled">Annulé</option></select><TransportEdit transport={transport} vehicles={activeVehicles} drivers={activeDrivers} onSave={async (data) => {
        if (!transport) return;
        const vehicleId = data.vehicleId === null ? undefined : data.vehicleId ?? transport.vehicleId ?? undefined;
        const driverId = data.driverId === null ? undefined : data.driverId ?? transport.driverId ?? undefined;
        const availability = await checkSchedule.mutateAsync({ data: {
          startAt: data.startAt ?? transport.startAt,
          endAt: data.endAt ?? transport.endAt,
          vehicleId,
          driverId,
          excludeTransportId: transport.id,
          passengerCount: transport.passengerCount,
        } });
        if (availability.conflicts.length || availability.capacityExceeded) {
          throw new Error(availability.conflicts.join(" ") || "La capacité du véhicule est insuffisante.");
        }
        await updateTransport.mutateAsync({ id, data });
        invalidate(getListTransportsQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange));
        setNotice("Planning du transport mis à jour.");
      }}/></div>;
    }
    if (path === "/admin/trajets-recurrents") {
      const route = row as unknown as RecurringRoute;
      return <div className="row-actions"><button className="text-link" onClick={async () => { try { await updateRecurringRoute.mutateAsync({ id, data: { active: !route.active } }); invalidate(getListRecurringRoutesQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange)); } catch { onFailure(); } }}>{route.active ? "Suspendre" : "Réactiver"}</button><button className="text-link" onClick={() => setExcludedRoute(excludedRoute === id ? "" : id)}>{excludedRoute === id ? "Fermer congés" : "Gérer les congés"}</button></div>;
    }
    if (path === "/admin/vehicules") {
      const vehicle = row as unknown as Vehicle;
      return <div className="row-actions"><button className="text-link" onClick={async () => { try { await updateVehicle.mutateAsync({ id, data: { active: !vehicle.active } }); invalidate(getListVehiclesQueryKey()); } catch { onFailure(); } }}>{vehicle.active ? "Désactiver" : "Réactiver"}</button><details className="row-edit"><summary>Modifier</summary><form className="compact-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await updateVehicle.mutateAsync({ id, data: { name: String(form.get("name")), registration: String(form.get("registration")), capacity: Number(form.get("capacity")), equipment: String(form.get("equipment") || "").split(",").map((item) => item.trim()).filter(Boolean) } }); invalidate(getListVehiclesQueryKey()); setNotice("Véhicule modifié."); } catch { onFailure("Modification refusée. Vérifiez les transports déjà planifiés."); } }}><input name="name" defaultValue={vehicle.name} required aria-label="Nom du véhicule"/><input name="registration" defaultValue={vehicle.registration} required aria-label="Immatriculation"/><input name="capacity" type="number" min="1" defaultValue={vehicle.capacity} required aria-label="Capacité"/><input name="equipment" defaultValue={vehicle.equipment?.join(", ") ?? ""} aria-label="Équipements"/><button className="button button-outline">Enregistrer</button></form></details><AvailabilityEditor label="Indisponibilité" intervals={vehicle.unavailableIntervals ?? []} onSave={async (intervals) => { await updateVehicle.mutateAsync({ id, data: { unavailableIntervals: intervals } }); invalidate(getListVehiclesQueryKey()); }}/></div>;
    }
    if (path === "/admin/chauffeurs") {
      const driver = row as unknown as Driver;
      return <div className="row-actions"><button className="text-link" onClick={async () => { try { await updateDriver.mutateAsync({ id, data: { active: !driver.active } }); invalidate(getListDriversQueryKey()); } catch { onFailure(); } }}>{driver.active ? "Désactiver" : "Réactiver"}</button><details className="row-edit"><summary>Modifier</summary><form className="compact-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await updateDriver.mutateAsync({ id, data: { name: String(form.get("name")), phone: String(form.get("phone")), email: String(form.get("email") || "") } }); invalidate(getListDriversQueryKey()); setNotice("Chauffeur modifié."); } catch { onFailure(); } }}><input name="name" defaultValue={driver.name} required aria-label="Nom"/><input name="phone" defaultValue={driver.phone} required aria-label="Téléphone"/><input name="email" type="email" defaultValue={driver.email ?? ""} aria-label="E-mail"/><button className="button button-outline">Enregistrer</button></form></details><AvailabilityEditor label="Indisponibilité" intervals={driver.unavailableIntervals ?? []} onSave={async (intervals) => { await updateDriver.mutateAsync({ id, data: { unavailableIntervals: intervals } }); invalidate(getListDriversQueryKey()); }}/></div>;
    }
    if (path === "/admin/voyages") {
      const trip = row as unknown as AdminTrip;
      return <div className="row-actions"><select aria-label="Visibilité du voyage" value={String(row.visibility)} onChange={async (event) => { try { await updateTrip.mutateAsync({ id, data: { visibility: event.target.value as "draft" | "published" | "archived" } }); invalidate(getListAdminTripsQueryKey()); setNotice("Visibilité mise à jour."); } catch { onFailure(); } }}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select><TripEdit trip={trip} onSave={async (data) => { try { await updateTrip.mutateAsync({ id, data }); invalidate(getListAdminTripsQueryKey()); setNotice("Voyage modifié."); } catch { throw new Error("Vérifiez que la capacité reste suffisante pour les inscriptions confirmées."); } }}/><button className="text-link" onClick={() => printPage(`Voyage ${getText(row, "title")}`, `<p class="brand">B-TRAVEL · VOYAGE</p><h1>${escapeHtml(row.title)}</h1><div class="row"><span>Destination</span><strong>${escapeHtml(row.destination)}</strong></div><div class="row"><span>Dates</span><strong>${escapeHtml(formatDate(row.startDate))} au ${escapeHtml(formatDate(row.endDate))}</strong></div><div class="row"><span>Tarif</span><strong>${escapeHtml(formatMoney(row.priceCents))}</strong></div><p>${escapeHtml(row.description)}</p>`)}><Printer size={15}/>Imprimer</button></div>;
    }
    if (path === "/admin/inscriptions") {
      const booking = row as unknown as TripRequest;
      return <div className="row-actions"><select aria-label="Statut de l’inscription" value={booking.status} onChange={async (event) => { try { await updateBooking.mutateAsync({ id, data: { status: event.target.value as "pending" | "confirmed" | "declined" | "cancelled" } }); invalidate(getListTripRequestsQueryKey(), getListAdminTripsQueryKey()); setNotice("Statut de l’inscription mis à jour."); } catch { onFailure("La capacité disponible ne permet peut-être plus cette confirmation."); } }}><option value="pending">À confirmer</option><option value="confirmed">Confirmée</option><option value="declined">Refusée</option><option value="cancelled">Annulée</option></select><BookingActions booking={booking} onChanged={() => invalidate(getListTripRequestsQueryKey())}/></div>;
    }
    if (path === "/admin/factures") {
      const invoice = row as unknown as Invoice;
      return <div className="row-actions"><button className="text-link" onClick={() => printPage(`Facture ${invoice.reference}`, `<p class="brand">B-TRAVEL · FACTURE</p><h1>${escapeHtml(invoice.reference)}</h1><div class="row"><span>Client</span><strong>${escapeHtml(invoice.clientName)}</strong></div><div class="row"><span>Créée le</span><strong>${escapeHtml(formatDate(invoice.createdAt))}</strong></div><div class="row"><span>Échéance</span><strong>${escapeHtml(formatDate(invoice.dueDate))}</strong></div><p class="total">${escapeHtml(formatMoney(invoice.totalCents))}</p><p>${escapeHtml(invoiceSettings.data?.legalText ?? "")}</p>`)}><Printer size={15}/>Imprimer</button>{invoice.status === "draft" && <button className="text-link" disabled={!invoiceSettings.data?.rulesApproved || issueInvoice.isPending} onClick={async () => { try { await issueInvoice.mutateAsync({ id }); invalidate(getListInvoicesQueryKey()); setNotice("Facture émise."); } catch { onFailure("Émission bloquée : vérifiez la validation comptable et les paramètres."); } }}>Émettre</button>}{["issued", "partially_paid"].includes(invoice.status) && <PaymentForm invoice={invoice} onSaved={() => invalidate(getListInvoicesQueryKey())}/>}</div>;
    }
    if (path === "/admin/taches") {
      return <label className="task-complete-control"><input type="checkbox" checked={Boolean(row.completed)} onChange={async (event) => { try { await updateTask.mutateAsync({ id, data: { completed: event.target.checked } }); invalidate(getListTasksQueryKey()); } catch { onFailure(); } }}/><span>{Boolean(row.completed) ? "Terminée" : "Terminer"}</span></label>;
    }
    if (path === "/admin/documents") {
      const objectPath = String(row.objectPath || "");
      const relative = objectPath.replace(/^\/objects\//, "");
      return <div className="row-actions"><a className="text-link" href={`/api/storage/objects/${relative}`} target="_blank" rel="noreferrer"><ArrowDownToLine size={15}/>Ouvrir / imprimer</a></div>;
    }
    return null;
  };

  const renderCreateForm = () => {
    if (!showForm) return null;
    if (path === "/admin/clients") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Nom<input name="name" minLength={2} required/></Field><Field>Organisation<input name="organization"/></Field><Field>E-mail<input name="email" type="email" required/></Field><Field>Téléphone<input name="phone" minLength={6} required/></Field><Field full>Adresse<input name="address"/></Field></div></CreateForm>;
    if (path === "/admin/demandes") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Nom / référent<input name="name" minLength={2} required/></Field><Field>Organisation<input name="organization"/></Field><Field>E-mail<input name="email" type="email" required/></Field><Field>Téléphone<input name="phone" minLength={6} required/></Field><Field>Type de transport<input name="type" required/></Field><Field>Type de trajet<select name="journey"><option value="one_way">Aller simple</option><option value="return">Aller-retour</option></select></Field><Field>Départ<input name="depart" type="datetime-local" required/></Field><Field>Retour<input name="return" type="datetime-local"/></Field><Field>Prise en charge<input name="pickup" required/></Field><Field>Destination<input name="destination" required/></Field><Field>Passagers<input name="passengers" type="number" min="1" required/></Field><Field full>Notes<textarea name="notes" rows={2}/></Field></div></CreateForm>;
    if (path === "/admin/devis") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Demande<select name="requestId" required defaultValue=""><option value="" disabled>Choisir une demande</option>{selectedRequestOptions.map((request) => <option key={request.id} value={request.id}>{request.reference} · {request.contactName} · {request.destination}</option>)}</select></Field><Field>Montant du devis (€)<input name="amount" type="number" min="0" step="0.01" required/></Field><Field>Valable jusqu’au<input name="validUntil" type="date"/></Field><Field full>Notes<textarea name="notes" rows={2}/></Field></div></CreateForm>;
    if (path === "/admin/transports") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Client<select name="clientId" defaultValue="" onChange={(event) => { const client = clients.data?.find((item) => item.id === event.currentTarget.value); const name = event.currentTarget.form?.elements.namedItem("clientName"); if (client && name instanceof HTMLInputElement) name.value = client.name; }}><option value="">Saisie manuelle</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.email}</option>)}</select></Field><Field>Nom du client<input name="clientName" required/></Field><Field>Départ<input name="startAt" type="datetime-local" required/></Field><Field>Fin prévue<input name="endAt" type="datetime-local" required/></Field><Field>Prise en charge<input name="pickup" required/></Field><Field>Destination<input name="destination" required/></Field><Field>Passagers<input name="passengers" type="number" min="1" required/></Field><Field>Véhicule<select name="vehicleId" defaultValue=""><option value="">À affecter</option>{activeVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.capacity} places</option>)}</select></Field><Field>Chauffeur<select name="driverId" defaultValue=""><option value="">À affecter</option>{activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></Field><Field full>Notes<textarea name="notes" rows={2}/></Field></div></CreateForm>;
    if (path === "/admin/trajets-recurrents") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Nom du trajet<input name="name" required/></Field><Field>Client / établissement<input name="clientName" required/></Field><Field>Début<input name="startDate" type="date" required/></Field><Field>Fin<input name="endDate" type="date" required/></Field><Field>Heure de départ<input name="startTime" type="time" required/></Field><Field>Heure de retour<input name="endTime" type="time" required/></Field><Field full>Jours de circulation<div className="weekday-picker">{WEEKDAYS.map(([value, label]) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={Number(value) <= 5}/>{label}</label>)}</div></Field><Field>Prise en charge<input name="pickup" required/></Field><Field>Destination<input name="destination" required/></Field><Field>Passagers<input name="passengers" type="number" min="1" required/></Field><Field>Véhicule<select name="vehicleId" defaultValue=""><option value="">À affecter</option>{activeVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></Field><Field>Chauffeur<select name="driverId" defaultValue=""><option value="">À affecter</option>{activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></Field><Field full className="note-label">Les congés scolaires FWB 2026-2028 sont préremplis et modifiables après création.</Field></div></CreateForm>;
    if (path === "/admin/vehicules") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Nom / modèle<input name="name" required/></Field><Field>Immatriculation<input name="registration" required/></Field><Field>Capacité<input name="capacity" type="number" min="1" required/></Field><Field>Équipements<input name="equipment" placeholder="Wi-Fi, PMR…" /></Field></div></CreateForm>;
    if (path === "/admin/chauffeurs") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Nom<input name="name" required/></Field><Field>Téléphone<input name="phone" minLength={6} required/></Field><Field>E-mail<input name="email" type="email"/></Field></div></CreateForm>;
    if (path === "/admin/voyages") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Titre<input name="title" minLength={2} required/></Field><Field>Adresse simplifiée<input name="slug" pattern="[a-z0-9-]+" minLength={2} required/></Field><Field>Destination<input name="destination" minLength={2} required/></Field><Field>Visibilité<select name="visibility"><option value="draft">Brouillon</option><option value="published">Publié</option></select></Field><Field>Départ<input name="startDate" type="date" required/></Field><Field>Retour<input name="endDate" type="date" required/></Field><Field>Prix par personne (€)<input name="price" type="number" min="0" step="0.01" required/></Field><Field>Capacité<input name="capacity" type="number" min="1" required/></Field><Field>Points de départ<input name="departurePoints" placeholder="Namur, Nivelles"/></Field><Field>URL photo<input name="imageUrl" type="url"/></Field><Field full>Description<textarea name="description" required rows={3}/></Field><Field full>Programme<textarea name="program" rows={3}/></Field></div></CreateForm>;
    if (path === "/admin/factures") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Client enregistré<select name="clientId" defaultValue="" onChange={(event) => { const client = clients.data?.find((item) => item.id === event.currentTarget.value); const name = event.currentTarget.form?.elements.namedItem("clientName"); if (client && name instanceof HTMLInputElement) name.value = client.name; }}><option value="">Saisie manuelle</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.email}</option>)}</select></Field><Field>Nom sur la facture<input name="clientName" required/></Field><Field>Montant total (€)<input name="amount" type="number" min="0.01" step="0.01" required/></Field><Field>Échéance<input name="dueDate" type="date"/></Field><Field>Transport associé<select name="transportId" defaultValue=""><option value="">Aucun</option>{transports.data?.map((transport) => <option key={transport.id} value={transport.id}>{transport.reference} · {transport.clientName}</option>)}</select></Field></div></CreateForm>;
    if (path === "/admin/taches") return <CreateForm onSubmit={createSubmit} pending={pending}><div className="form-grid"><Field>Tâche<input name="title" required/></Field><Field>Catégorie<input name="category"/></Field><Field>Échéance<input name="due" type="date"/></Field></div></CreateForm>;
    return null;
  };

  const renderTableRows = () => {
    if (path === "/admin/transports") {
      const events = (occurrences.data ?? []) as unknown as Row[];
      return events.filter((event) => JSON.stringify(event).toLowerCase().includes(search.toLowerCase().trim())).map((event) => (
        <tr key={String(event.id)}><td className="strong-cell">{getText(event, "title")}{event.kind === "recurring" && <small className="table-subline">Récurrent</small>}</td><td>{getText(event, "pickupAddress")} → {getText(event, "destination")}</td><td>{formatDateTime(event.startAt)}</td><td>{formatDateTime(event.endAt)}</td><td>{getText(event, "passengerCount")}</td><td>{event.kind === "recurring" ? "Récurrent" : statusLabel(event.status)}</td><td>{event.kind === "transport" ? rowActions(event) : "—"}</td></tr>
      ));
    }
    return filtered.map((row) => (
      <tr key={String(row.id)}>
        {columns.map((column, index) => (
          <td key={column} className={index === 0 ? "strong-cell" : ""}>
            {["Statut", "État", "Paiement", "Visibilité"].includes(column)
              ? <span className={`status-tag status-${statusLabel(cellValue(row, path, column)).toLowerCase().replaceAll(" ", "-")}`}>{statusLabel(cellValue(row, path, column))}</span>
              : renderCell(row, path, column)}
          </td>
        ))}
        <td>{rowActions(row)}</td>
      </tr>
    ));
  };

  return (
    <Shell title={title}>
      <main className="admin-content module-content">
        <div className="module-title-row">
          <div><div className="eyebrow">ESPACE DE GESTION</div><h1>{title}</h1><p>{subtitle}</p></div>
          {path !== "/admin/documents" && <button className="button button-orange" onClick={() => { setShowForm((value) => !value); setError(""); setNotice(""); }}><Plus size={16}/>{showForm ? "Fermer" : path === "/admin/factures" ? "Nouvelle facture" : "Ajouter"}</button>}
          {path === "/admin/documents" && <button className="button button-orange" onClick={() => { setShowForm((value) => !value); setError(""); setNotice(""); }}><Upload size={16}/>{showForm ? "Fermer" : "Ajouter un document"}</button>}
        </div>

        {notice && <SuccessMessage>{notice}</SuccessMessage>}
        {error && <ErrorMessage>{error}</ErrorMessage>}

        {path === "/admin/transports" && (
          <section className="schedule-panel">
            <div className="schedule-toolbar">
              <div className="schedule-tabs" role="tablist" aria-label="Vue du planning">
                {(["day", "week", "month"] as const).map((view) => <button key={view} role="tab" aria-selected={scheduleView === view} className={scheduleView === view ? "selected" : ""} onClick={() => setScheduleView(view)}>{view === "day" ? "Jour" : view === "week" ? "Semaine" : "Mois"}</button>)}
              </div>
              <label className="schedule-date"><CalendarDays size={16}/><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} aria-label="Date du planning"/></label>
            </div>
            <div className="schedule-range">{formatDate(scheduleRange.from)} au {formatDate(scheduleRange.to)} · {occurrences.data?.length ?? 0} trajets</div>
          </section>
        )}

        {path === "/admin/factures" && (
          <InvoiceSettingsPanel
            settings={invoiceSettings.data}
            onSave={async (data) => {
              try {
                await updateInvoiceSettings.mutateAsync({ data });
                invalidate(getGetInvoiceSettingsQueryKey());
                setNotice(data.accountantConfirmed ? "Règles marquées comme validées." : "Paramètres enregistrés sans validation comptable.");
              } catch { onFailure("Les paramètres de facturation n’ont pas pu être enregistrés."); }
            }}
            pending={updateInvoiceSettings.isPending}
          />
        )}

        {path === "/admin/documents" && showForm && (
          <DocumentUpload
            pending={requestUploadUrl.isPending || createDocument.isPending}
            entities={documentEntities}
            onUpload={async (file, name, entityType, entityId) => {
              setError("");
              try {
                const signed = await requestUploadUrl.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
                const uploaded = await fetch(signed.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
                if (!uploaded.ok) throw new Error("upload");
                await createDocument.mutateAsync({ data: { name, objectPath: signed.objectPath, entityType: entityType as "client" | "quote_request" | "quote" | "transport" | "trip" | "trip_request" | "invoice", entityId } });
                onSuccess("Document ajouté au dossier.", getListDocumentsQueryKey());
              } catch { onFailure("Le document n’a pas pu être envoyé. Vérifiez le format et la taille du fichier."); }
            }}
          />
        )}

        {path === "/admin/factures" && (
          <div className="module-tools">
            <button className="button button-outline" onClick={() => exportInvoices((invoices.data ?? []) as Invoice[])}><ArrowDownToLine size={15}/>Exporter les factures en CSV</button>
            {!invoiceSettings.data?.rulesApproved && <span className="blocked-note"><ShieldCheck size={16}/>Émission désactivée jusqu’à la validation du comptable.</span>}
          </div>
        )}

        {path === "/admin/documents" && !showForm && <p className="privacy-note"><ShieldCheck size={15}/>Ces documents sont privés et accessibles uniquement à la responsable.</p>}

        {renderCreateForm()}

        {path === "/admin/trajets-recurrents" && excludedRoute && (
          <HolidayExceptionPanel
            route={recurringRoutes.data?.find((route) => route.id === excludedRoute)}
            onSave={async (ranges) => {
              const route = recurringRoutes.data?.find((item) => item.id === excludedRoute);
              if (!route) return;
              try {
                await updateRecurringRoute.mutateAsync({ id: route.id, data: { excludedRanges: ranges } });
                invalidate(getListRecurringRoutesQueryKey(), getListScheduleOccurrencesQueryKey(scheduleRange));
                setNotice("Périodes de suspension mises à jour.");
              } catch { onFailure(); }
            }}
          />
        )}

        {path === "/admin/clients" && selectedClient && clientHistory.data && <ClientHistoryPanel clientId={selectedClient}/>}

        {path === "/admin/factures" && (
          <div className="table-tools">
            <label className="search-field"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" aria-label="Rechercher dans les factures"/></label>
            <span>{filtered.length} résultat{filtered.length === 1 ? "" : "s"}</span>
          </div>
        )}

        {path !== "/admin/factures" && (
          <div className="table-tools"><label className="search-field"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" aria-label="Rechercher dans la liste"/></label><span>{path === "/admin/transports" ? occurrences.data?.length ?? 0 : rawData.length} résultat{rawData.length === 1 ? "" : "s"}</span></div>
        )}

        {queryLoading ? <div className="table-skeleton">{[1, 2, 3, 4].map((item) => <div key={item}/>)}</div>
          : queryError ? <div className="error-panel"><CircleAlert/><div><b>Impossible de charger ces données.</b><p>Vérifiez votre accès puis réessayez.</p><button className="button button-orange" onClick={() => invalidate(refreshKey())}>Réessayer</button></div></div>
          : (path === "/admin/transports" ? occurrences.data?.length === 0 : filtered.length === 0)
            ? <div className="empty-table"><div className="empty-icon"><FileText/></div><strong>{search ? "Aucun résultat pour cette recherche." : "Aucune donnée pour le moment."}</strong><span>{search ? "Essayez un autre terme." : "Les enregistrements apparaîtront ici une fois créés."}</span>{path !== "/admin/documents" && !search && <button className="text-link" onClick={() => setShowForm(true)}>Ajouter un élément <ArrowRight size={14}/></button>}</div>
            : <div className="table-wrap"><table><thead><tr>{(path === "/admin/transports" ? ["Trajet", "Itinéraire", "Départ", "Fin", "Passagers", "Type", "Fiche"] : [...columns, "Actions"]).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{renderTableRows()}</tbody></table></div>}
      </main>
    </Shell>
  );
}

function CreateForm({ children, onSubmit, pending }: { children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; pending: boolean }) {
  return <form className="inline-create admin-create-form" onSubmit={onSubmit}><div className="form-section-title"><span>Nouvel élément</span></div>{children}<div className="form-footer"><button className="button button-orange" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button></div></form>;
}

function AvailabilityEditor({ label, intervals, onSave }: { label: string; intervals: DateTimeRange[]; onSave: (value: DateTimeRange[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const startAt = localDateTimeToIso(String(form.get("startAt")));
      const endAt = localDateTimeToIso(String(form.get("endAt")));
      if (Date.parse(startAt) >= Date.parse(endAt)) throw new Error("invalid");
      await onSave([...intervals, { startAt, endAt }]);
      setError("");
      event.currentTarget.reset();
    } catch { setError("Vérifiez la période d’indisponibilité."); }
  };
  return <details className="row-edit"><summary>{label}</summary><div className="row-action-details">{intervals.map((range, index) => <span key={`${range.startAt}-${index}`}>{formatDateTime(range.startAt)} au {formatDateTime(range.endAt)} <button className="text-link" onClick={async () => { try { await onSave(intervals.filter((_, item) => item !== index)); } catch { setError("La période n’a pas pu être supprimée."); } }}>Retirer</button></span>)}<form className="compact-form" onSubmit={add}><input type="datetime-local" name="startAt" required aria-label="Début d’indisponibilité"/><input type="datetime-local" name="endAt" required aria-label="Fin d’indisponibilité"/><button className="button button-outline">{label}</button></form>{error && <ErrorMessage>{error}</ErrorMessage>}</div></details>;
}

function HolidayExceptionPanel({ route, onSave }: { route?: RecurringRoute; onSave: (ranges: { startDate: string; endDate: string }[]) => Promise<void> }) {
  const [error, setError] = useState("");
  if (!route) return null;
  const currentRanges = route.excludedRanges ?? [];
  const officialRanges = FWB_SCHOOL_HOLIDAYS.filter((range) => range.endDate >= route.startDate && range.startDate <= route.endDate);
  const missingOfficialRanges = officialRanges.filter((range) => !currentRanges.some((current) => current.startDate <= range.startDate && current.endDate >= range.endDate));
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const range = { startDate: String(form.get("startDate")), endDate: String(form.get("endDate")) };
    if (range.startDate > range.endDate) {
      setError("La fin de la période doit suivre le début.");
      return;
    }
    try {
      await onSave([...(route.excludedRanges ?? []), range]);
      setError("");
      event.currentTarget.reset();
    } catch { setError("La période n’a pas pu être enregistrée."); }
  };
  const addOfficialHolidays = async () => {
    try {
      await onSave([...currentRanges, ...missingOfficialRanges]);
      setError("");
    } catch { setError("Les congés scolaires n’ont pas pu être ajoutés."); }
  };
  return <section className="inline-detail holiday-panel"><div className="panel-head"><div><strong>Congés et exceptions · {route.name}</strong><span>Les dates ci-dessous suspendent ce trajet récurrent.</span></div></div>{currentRanges.map((range, index) => <div className="holiday-range" key={`${range.startDate}-${index}`}><span>{formatDate(range.startDate)} au {formatDate(range.endDate)}</span><button className="text-link" onClick={async () => { try { await onSave(currentRanges.filter((_, item) => item !== index)); setError(""); } catch { setError("La période n’a pas pu être supprimée."); } }}>Retirer</button></div>)}<div className="holiday-source"><span>Calendrier officiel de la Fédération Wallonie-Bruxelles, 2026-2028.</span><button className="button button-outline" type="button" disabled={!missingOfficialRanges.length} onClick={addOfficialHolidays}>{missingOfficialRanges.length ? "Ajouter les congés scolaires" : "Congés officiels déjà ajoutés"}</button><a href="https://www.enseignement.be/calendrierscolaire" target="_blank" rel="noreferrer">Voir le calendrier</a></div><form className="compact-form" onSubmit={add}><input type="date" name="startDate" required aria-label="Début de la suspension"/><input type="date" name="endDate" required aria-label="Fin de la suspension"/><button className="button button-outline">Ajouter une période</button></form>{error && <ErrorMessage>{error}</ErrorMessage>}</section>;
}

function InvoiceSettingsPanel({ settings, onSave, pending }: { settings?: { rulesApproved: boolean; approvedAt?: string | null; invoicePrefix: string | null; nextSequence: number | null; vatRatePercent: number | null; legalText: string | null; dueDays: number | null; reviewerName: string | null }; onSave: (data: { invoicePrefix: string; nextSequence: number; vatRatePercent: number; legalText: string; dueDays: number; reviewerName: string; accountantConfirmed: boolean }) => Promise<void>; pending: boolean }) {
  return <details className="invoice-settings"><summary><ShieldCheck size={16}/>Paramètres et validation comptable <span className={`status-tag ${settings?.rulesApproved ? "status-accepted" : "status-draft"}`}>{settings?.rulesApproved ? "Validés" : "À valider"}</span></summary><form className="inline-create" key={settings?.approvedAt ?? "not-approved"} onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await onSave({ invoicePrefix: String(form.get("prefix")), nextSequence: Number(form.get("sequence")), vatRatePercent: Number(form.get("vat")), legalText: String(form.get("legalText")), dueDays: Number(form.get("dueDays")), reviewerName: String(form.get("reviewer")), accountantConfirmed: form.get("accountantConfirmed") === "on" }); }}><p className="form-note">Ne cochez la validation qu’après confirmation des mentions, numérotation et règles de TVA par le comptable.</p><div className="form-grid"><Field>Préfixe<input name="prefix" defaultValue={settings?.invoicePrefix ?? ""} required maxLength={12}/></Field><Field>Prochain numéro<input name="sequence" type="number" min="1" defaultValue={settings?.nextSequence ?? 1} required/></Field><Field>Taux de TVA (%)<input name="vat" type="number" min="0" max="100" step="0.01" defaultValue={settings?.vatRatePercent ?? 0} required/></Field><Field>Délai de paiement (jours)<input name="dueDays" type="number" min="0" max="365" defaultValue={settings?.dueDays ?? 30} required/></Field><Field>Validé par<input name="reviewer" defaultValue={settings?.reviewerName ?? ""} minLength={2} required/></Field><Field full>Mentions légales<textarea name="legalText" defaultValue={settings?.legalText ?? ""} rows={3} required/></Field><label className="span-all confirmation-check"><input type="checkbox" name="accountantConfirmed" defaultChecked={settings?.rulesApproved ?? false}/><span>Je confirme que ces règles ont été vérifiées avec le comptable.</span></label></div><button className="button button-outline" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les paramètres"}</button></form></details>;
}

function PaymentForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const recordPayment = useRecordPayment();
  const [error, setError] = useState("");
  return <details className="row-edit"><summary>Ajouter un paiement</summary><form className="compact-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); try { await recordPayment.mutateAsync({ data: { targetType: "invoice", targetId: invoice.id, amountCents: Math.round(Number(form.get("amount")) * 100), paidAt: new Date().toISOString(), note: String(form.get("note") || "") } }); onSaved(); } catch { setError("Le montant dépasse peut-être le solde restant."); } }}><input name="amount" type="number" min="0.01" step="0.01" placeholder="Montant (€)" required aria-label="Montant reçu en euros"/><input name="note" placeholder="Mode ou référence" aria-label="Mode ou référence"/><button className="button button-outline" disabled={recordPayment.isPending}>Enregistrer</button>{error && <ErrorMessage>{error}</ErrorMessage>}</form></details>;
}

function DocumentUpload({ pending, entities, onUpload }: {
  pending: boolean;
  entities: Record<string, { id: string; label: string }[]>;
  onUpload: (file: File, name: string, entityType: string, entityId: string) => Promise<void>;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState("client");
  const [error, setError] = useState("");
  return <form className="inline-create" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selectedFile) { setError("Choisissez un fichier."); return; }
    const entityId = String(form.get("entityId") || "");
    if (!entityId) { setError("Choisissez un dossier."); return; }
    await onUpload(selectedFile, String(form.get("name")), entityType, entityId);
  }}>
    <div className="form-grid">
      <Field>Nom du document<input name="name" minLength={2} required/></Field>
      <Field>Type de dossier<select name="entityType" value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="client">Client</option><option value="quote_request">Demande</option><option value="quote">Devis</option><option value="transport">Transport</option><option value="trip">Voyage</option><option value="trip_request">Inscription</option><option value="invoice">Facture</option></select></Field>
      <Field>Dossier<select name="entityId" key={entityType} required defaultValue=""><option value="" disabled>{entities[entityType]?.length ? "Choisir un dossier" : "Aucun dossier disponible"}</option>{(entities[entityType] ?? []).map((entity) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></Field>
      <Field>Fichier PDF ou image<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} required/></Field>
    </div>
    <p className="form-note">PDF, JPG, PNG ou WebP. Taille maximale : 25 Mo. Le fichier reste privé.</p>
    <div className="form-footer"><button className="button button-orange" disabled={pending || !entities[entityType]?.length}>{pending ? "Envoi…" : "Envoyer le document"}</button>{error && <ErrorMessage>{error}</ErrorMessage>}</div>
  </form>;
}

function renderCell(row: Row, path: string, column: string): ReactNode {
  const dateKeys: Record<string, string> = {
    "Date": "departureAt",
    "Départ": path === "/admin/voyages" ? "startDate" : "startAt",
    "Créé le": "createdAt",
    "Ajouté le": "createdAt",
    "Échéance": "dueDate",
    "Validité": "validUntil",
  };
  if (dateKeys[column]) return formatDate(row[dateKeys[column]]);
  if (column === "Départ" && path === "/admin/transports") return formatDateTime(row.startAt);
  if (column === "Passagers") return getText(row, path === "/admin/inscriptions" ? "seatCount" : "passengerCount");
  if (column === "Montant") return formatMoney(row.totalCents ?? row.amountDueCents);
  if (column === "Réglé") return formatMoney(row.paidCents ?? row.amountPaidCents);
  if (column === "Prix") return formatMoney(row.priceCents);
  if (column === "Places") return path === "/admin/voyages" ? `${getText(row, "remainingSeats")} / ${getText(row, "capacity")}` : getText(row, path === "/admin/inscriptions" ? "seatCount" : "remainingSeats");
  if (column === "Statut") return statusLabel(cellValue(row, path, column));
  if (column === "État") return row.completed ? "Terminée" : "À faire";
  if (column === "Paiement") return getText(row, "paymentState");
  if (column === "Visibilité") return getText(row, "visibility");
  if (column === "Période") return `${formatDate(row.startDate)} au ${formatDate(row.endDate)}`;
  if (column === "Jours") return Array.isArray(row.weekdays) ? row.weekdays.map((day) => WEEKDAYS.find(([value]) => Number(value) === day)?.[1] ?? day).join(", ") : "—";
  if (column === "Équipements") return Array.isArray(row.equipment) && row.equipment.length ? row.equipment.join(", ") : "—";
  if (column === "Contact") return <>{getText(row, "contactName")}<small className="table-subline">{getText(row, "email")}</small></>;
  if (column === "Trajet") return <>{getText(row, "pickupAddress")} → {getText(row, "destination")}</>;
  if (column === "Demande") return <>{getText(row, "requestReference") === "—" ? getText(row, "requestId") : getText(row, "requestReference")}<small className="table-subline">{getText(row, "clientName")} · {getText(row, "destination")}</small></>;
  if (column === "Organisation") return getText(row, "organizationName");
  if (column === "Client") return getText(row, "clientName");
  if (column === "Dossier") return getText(row, "entityType");
  if (column === "Voyage") return getText(row, "tripTitle") === "—" ? getText(row, "title") : getText(row, "tripTitle");
  if (column === "Places" && path === "/admin/voyages") return `${getText(row, "remainingSeats")} / ${getText(row, "capacity")}`;
  if (column === "Facture") return getText(row, "reference");
  if (column === "Tâche") return getText(row, "title");
  if (column === "Catégorie") return getText(row, "category");
  if (column === "Nom") return getText(row, "name");
  if (column === "Véhicule") return getText(row, "name");
  if (column === "Immatriculation") return getText(row, "registration");
  if (column === "Capacité") return getText(row, "capacity");
  if (column === "Destination") return getText(row, "destination");
  if (column === "Référence") return getText(row, "reference");
  if (column === "Voyage") return getText(row, "title");
  if (column === "Client") return getText(row, "clientName");
  if (column === "Nom du document") return getText(row, "name");
  return getText(row, column);
}

function cellValue(row: Row, path: string, column: string): unknown {
  if (column === "Statut") return path === "/admin/vehicules" || path === "/admin/chauffeurs" ? String(Boolean(row.active)) : path === "/admin/trajets-recurrents" ? row.active ? "active" : "inactive" : row.status;
  if (column === "État") return row.completed ? "true" : "false";
  if (column === "Paiement") return row.paymentState;
  if (column === "Visibilité") return row.visibility;
  return renderCell(row, path, column);
}

function exportInvoices(rows: Invoice[]): void {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["Référence", "Client", "Montant (€)", "Réglé (€)", "Échéance", "Statut"].map(escape).join(";"),
    ...rows.map((invoice) => [
      invoice.reference,
      invoice.clientName,
      (invoice.totalCents / 100).toFixed(2),
      (invoice.paidCents / 100).toFixed(2),
      invoice.dueDate ?? "",
      statusLabel(invoice.status),
    ].map(escape).join(";")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `btravel-factures-${todayString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default AdminModulePage;

function RequestDetails({ row }: { row: Row }) {
  const when = (value: unknown) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(String(value))) : "—";
  const lines: [string, string][] = [
    ["Contact", String(row.contactName ?? "—")],
    ["Organisation", String(row.organizationName || "—")],
    ["Téléphone", String(row.phone ?? "—")],
    ["E-mail", String(row.email ?? "—")],
    ["Type de transport", String(row.transportType ?? "—")],
    ["Trajet", row.journeyType === "return" ? "Aller-retour" : "Aller simple"],
    ["Départ", when(row.departureAt)],
    ["Retour", when(row.returnAt)],
    ["Prise en charge", String(row.pickupAddress ?? "—")],
    ["Destination", String(row.destination ?? "—")],
    ["Passagers", String(row.passengerCount ?? "—")],
  ];
  return <details className="row-edit"><summary>Voir la demande</summary><div className="row-action-details request-details">
    <dl>{lines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === "Téléphone" && value !== "—" ? <a href={`tel:${value.replace(/\s/g, "")}`}>{value}</a> : label === "E-mail" && value !== "—" ? <a href={`mailto:${value}`}>{value}</a> : value}</dd></div>)}</dl>
    {row.notes ? <p style={{ whiteSpace: "pre-line" }}><strong>Informations complémentaires</strong><br/>{String(row.notes)}</p> : null}
  </div></details>;
}
