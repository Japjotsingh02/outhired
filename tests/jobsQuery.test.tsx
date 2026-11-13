import "./helpers/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getErrorMessage } from "@/lib/apiClient";
import { useCreateJob, useJobs } from "@/lib/queries/jobs";
import { ProfileMatchPanel } from "@/components/ProfileMatchPanel";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = { user: { id: "u1", name: "Test", email: "t@example.com" }, expires: "2999-01-01T00:00:00.000Z" };

/** Fake server: answers /api/jobs from the queue and counts those calls. */
function stubJobsApi(responses: Array<Response | Error>) {
  const state = { jobsCalls: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/api/jobs")) return json(session);
    const next = responses[state.jobsCalls++];
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return state;
}

function renderWithProviders(ui: React.ReactElement) {
  return renderWithClient(ui).view;
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const view = render(
    <SessionProvider session={session}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SessionProvider>,
  );
  return { client, view };
}

/** The jobs-load block of Workspace: the same hook, the same surfaces. */
function JobsHarness() {
  const jobs = useJobs();
  if (jobs.isPending) return <p>Loading</p>;
  if (jobs.isError && jobs.data === undefined) {
    return (
      <ErrorState
        title="We couldn't load your applications"
        message={getErrorMessage(jobs.error)}
        onRetry={() => void jobs.refetch()}
      />
    );
  }
  return (
    <>
      {jobs.isRefetchError && (
        <InlineAlert action={{ label: "Retry", onClick: () => void jobs.refetch() }}>
          Couldn&apos;t refresh your applications.
        </InlineAlert>
      )}
      <p>{(jobs.data ?? []).length} applications</p>
      <button type="button" onClick={() => void jobs.refetch()}>
        Reload
      </button>
    </>
  );
}

test("a failed jobs load shows the error state with Retry, and Retry refetches and shows the jobs", async () => {
  console.error = () => undefined;
  const api = stubJobsApi([json({ error: "Something went wrong", code: "INTERNAL", requestId: "ab12cd34" }, 500), json([{ id: "j1" }, { id: "j2" }])]);

  renderWithProviders(<JobsHarness />);

  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /couldn't load your applications/i);
  assert.match(alert.textContent ?? "", /try again/i);
  // An empty list must never be shown in place of a failure.
  assert.equal(screen.queryByText(/^\d+ applications$/), null);

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  assert.ok(await screen.findByText("2 applications"));
  assert.equal(api.jobsCalls, 2);
  assert.equal(screen.queryByRole("alert"), null);
});

test("a network failure shows the connection message with Retry", async () => {
  console.error = () => undefined;
  stubJobsApi([new TypeError("fetch failed")]);

  renderWithProviders(<JobsHarness />);

  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /connection/i);
  assert.ok(screen.getByRole("button", { name: "Retry" }));
});

test("a failed refetch keeps the jobs on screen and adds a Retry note instead of the error state", async () => {
  console.error = () => undefined;
  stubJobsApi([json([{ id: "j1" }]), json({ error: "x", code: "INTERNAL" }, 500), json([{ id: "j1" }, { id: "j2" }])]);

  renderWithProviders(<JobsHarness />);
  assert.ok(await screen.findByText("1 applications"));

  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  const note = await screen.findByRole("alert");
  assert.match(note.textContent ?? "", /couldn't refresh/i);
  assert.ok(screen.getByText("1 applications"), "the data stays on screen");

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  assert.ok(await screen.findByText("2 applications"));
  assert.equal(screen.queryByRole("alert"), null);
});

test("InlineAlert announces errors as alerts and info as status, and runs its action", () => {
  let clicked = 0;
  render(
    <>
      <InlineAlert action={{ label: "Retry", onClick: () => clicked++ }}>It failed</InlineAlert>
      <InlineAlert variant="info">Heads up</InlineAlert>
    </>,
  );
  assert.equal(screen.getByRole("alert").textContent?.includes("It failed"), true);
  assert.equal(screen.getByRole("status").textContent?.includes("Heads up"), true);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  assert.equal(clicked, 1);
});

test("ConfirmDialog cancels on Escape, focuses Cancel when destructive, and confirms on click", () => {
  const events: string[] = [];
  render(
    <ConfirmDialog
      open
      destructive
      title="Delete application?"
      description="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={() => events.push("confirm")}
      onCancel={() => events.push("cancel")}
    />,
  );
  assert.ok(screen.getByRole("alertdialog", { name: "Delete application?" }));
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Cancel" }));
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  assert.deepEqual(events, ["cancel", "confirm"]);
});

test("a 403 PROFILE_INCOMPLETE in the compare panel shows an inline link to the profile, not a retry", async () => {
  console.error = () => undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).includes("/api/compare-profile")
      ? json({ error: "Complete your profile", code: "PROFILE_INCOMPLETE", details: { missing: ["resume"] }, requestId: "ab12cd34" }, 403)
      : json(session)) as typeof fetch;

  renderWithProviders(<ProfileMatchPanel candidateId="c1" candidateName="Ada" jobTitle="Engineer" onClose={() => undefined} />);

  const alert = await screen.findByRole("alert");
  const link = screen.getByRole("link", { name: "Open profile" });
  assert.equal(link.getAttribute("href"), "/profile");
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
  assert.ok(alert.textContent);
});

test("a compare failure shows Try again, and Try again runs the comparison once more", async () => {
  console.error = () => undefined;
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (!String(input).includes("/api/compare-profile")) return json(session);
    calls++;
    return calls === 1
      ? json({ error: "x", code: "INTERNAL", requestId: "ab12cd34" }, 500)
      : json({ score: 80, summary: "Strong fit", sharedStrengths: [], gaps: [], advice: "Apply", cached: false });
  }) as typeof fetch;

  renderWithProviders(<ProfileMatchPanel candidateId="c1" candidateName="Ada" jobTitle="Engineer" onClose={() => undefined} />);

  await screen.findByRole("alert");
  assert.equal(calls, 1, "the comparison starts once when the panel opens");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  assert.ok(await screen.findByText("Strong fit"));
  assert.equal(calls, 2);
});

test("creating a job puts it at the top of the cached list, and 200 means it already existed", async () => {
  const existing = { id: "j2", role: "Old" }; let created = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/jobs") && init?.method === "POST") {
      created = true;
      return json({ id: "j1", role: "New" }, 200);
    }
    if (String(input).includes("/api/jobs")) return json(created ? [{ id: "j1", role: "New" }, existing] : [existing]);
    return json(session);
  }) as typeof fetch;

  function Creator() {
    const jobs = useJobs();
    const create = useCreateJob();
    return (
      <>
        <p>{jobs.data ? `${jobs.data.length} loaded` : "loading"}</p>
        <button type="button" onClick={() => create.mutate({ role: "New" })}>
          Create
        </button>
        <p>{create.data ? `status ${create.data.status}` : "idle"}</p>
      </>
    );
  }

  const { client } = renderWithClient(<Creator />);
  await screen.findByText("1 loaded");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await screen.findByText("status 200");
  const cached = client.getQueryData<Array<{ id: string }>>(["user", "u1", "jobs"]);
  assert.equal(cached?.[0].id, "j1");
});
