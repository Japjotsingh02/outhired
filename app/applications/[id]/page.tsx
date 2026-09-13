import { Workspace } from "@/components/Workspace";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApplicationDetailPage({ params, searchParams }: ApplicationDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const candidateId = Array.isArray(query.candidate) ? query.candidate[0] : query.candidate;
  const compareCandidateId = Array.isArray(query.compare) ? query.compare[0] : query.compare;

  return (
    <Workspace
      section="applications"
      initialJobId={id}
      initialCandidateId={candidateId}
      initialCompareCandidateId={compareCandidateId}
    />
  );
}
