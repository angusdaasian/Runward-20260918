import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, Loader2, Upload, RefreshCw, ExternalLink } from "lucide-react";

interface ExportResult {
  success: boolean;
  year: string;
  activities: number;
  users: number;
  gcs_uri: string;
  size_bytes: number;
  location: string;
  bucket: string;
}

interface JobResult {
  success: boolean;
  job: {
    name: string;
    displayName: string;
    state: string;
    createTime: string;
    tunedModelDisplayName: string;
  };
  location: string;
  project_id: string;
}

interface JobStatus {
  success: boolean;
  job: {
    name: string;
    displayName: string;
    state: string;
    createTime: string;
    startTime?: string;
    endTime?: string;
    error?: string;
    tunedModel?: string;
    modelToValidate?: string;
    trainingStats?: unknown;
  };
  location: string;
  project_id: string;
}

const AdminLlamaTraining = () => {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [gcsUri, setGcsUri] = useState("");
  const [jobName, setJobName] = useState("");
  const [displayName, setDisplayName] = useState("runner-coach-llama-3-1-8b");
  const [trainSteps, setTrainSteps] = useState(300);
  const [learningRate, setLearningRate] = useState(1.0);
  const [submitting, setSubmitting] = useState(false);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("export-coach-training-data", {
        body: {},
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Export failed");
      setExportResult(data as ExportResult);
      setGcsUri(data.gcs_uri);
      toast.success(`Exported ${data.activities} activities for ${data.users} users`);
    } catch (e: any) {
      console.error("[llama export]", e);
      toast.error(e?.message || "Failed to export training data");
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async () => {
    if (!gcsUri.trim()) {
      toast.error("Enter a GCS JSONL URI first");
      return;
    }
    setSubmitting(true);
    setJobResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("submit-llama-tuning-job", {
        body: {
          gcs_uri: gcsUri.trim(),
          display_name: displayName,
          train_steps: trainSteps,
          learning_rate_multiplier: learningRate,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Submit failed");
      setJobResult(data as JobResult);
      setJobName(data.job.name);
      toast.success(`Tuning job submitted: ${data.job.displayName}`);
    } catch (e: any) {
      console.error("[llama submit]", e);
      toast.error(e?.message || "Failed to submit tuning job");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheck = async () => {
    const name = jobName.trim() || jobResult?.job?.name;
    if (!name) {
      toast.error("Enter a job name/resource ID");
      return;
    }
    setChecking(true);
    setJobStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-tuning-job", {
        body: {},
        query: { job_name: name },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Check failed");
      setJobStatus(data as JobStatus);
      toast.success(`Job status: ${data.job.state}`);
    } catch (e: any) {
      console.error("[llama check]", e);
      toast.error(e?.message || "Failed to check tuning job");
    } finally {
      setChecking(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const vertexConsoleUrl = (projectId?: string, location?: string) => {
    if (!projectId) return "https://console.cloud.google.com/vertex-ai";
    return `https://console.cloud.google.com/vertex-ai/locations/${location || "us-central1"}/tuning?project=${projectId}`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Brain className="h-4 w-4" /> Base model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">Llama 3.1 8B Instruct</p>
            <p className="text-xs text-muted-foreground">Vertex AI Model Garden</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Upload className="h-4 w-4" /> Dataset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {exportResult ? exportResult.activities.toLocaleString() : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {exportResult ? `${exportResult.users} users · ${formatBytes(exportResult.size_bytes)}` : "2026 activities"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Job status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {jobStatus ? jobStatus.job.state : jobResult ? jobResult.job.state : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {jobStatus?.job?.tunedModel || jobStatus?.job?.modelToValidate || "No tuned model yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            1. Export training dataset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pulls every 2026 running activity across all connected fitness apps, joins runner profiles, and writes a
            Llama chat-formatted JSONL file to the training GCS bucket.
          </p>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {exporting ? "Exporting…" : "Export 2026 training data"}
          </Button>

          {exportResult && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{exportResult.year}</Badge>
                <span className="text-muted-foreground">{exportResult.activities.toLocaleString()} activities</span>
                <span className="text-muted-foreground">· {exportResult.users.toLocaleString()} users</span>
              </div>
              <div className="break-all font-mono text-xs">{exportResult.gcs_uri}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(exportResult.size_bytes)} · {exportResult.location}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            2. Submit Llama tuning job
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>GCS training URI</Label>
              <Input
                value={gcsUri}
                onChange={(e) => setGcsUri(e.target.value)}
                placeholder="gs://bucket/runner-coach-2026-...jsonl"
              />
            </div>
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Train steps</Label>
              <Input type="number" min={10} max={5000} value={trainSteps} onChange={(e) => setTrainSteps(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Learning-rate multiplier</Label>
              <Input type="number" step={0.1} min={0.1} max={10} value={learningRate} onChange={(e) => setLearningRate(Number(e.target.value))} />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !gcsUri.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
            {submitting ? "Submitting…" : "Submit tuning job"}
          </Button>

          {jobResult && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <div className="font-medium">{jobResult.job.displayName}</div>
              <div className="break-all font-mono text-xs">{jobResult.job.name}</div>
              <div className="text-xs text-muted-foreground">State: {jobResult.job.state} · Project: {jobResult.project_id}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            3. Check tuning job status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Job resource name or ID"
              className="flex-1"
            />
            <Button onClick={handleCheck} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Check
            </Button>
          </div>

          {jobStatus && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge>{jobStatus.job.state}</Badge>
                <span className="font-medium">{jobStatus.job.displayName}</span>
              </div>
              <div className="break-all font-mono text-xs">{jobStatus.job.name}</div>
              {jobStatus.job.tunedModel && (
                <div className="text-xs text-muted-foreground">Tuned model: {jobStatus.job.tunedModel}</div>
              )}
              {jobStatus.job.modelToValidate && (
                <div className="text-xs text-muted-foreground">Model to validate: {jobStatus.job.modelToValidate}</div>
              )}
              {jobStatus.job.error && <div className="text-xs text-destructive">Error: {jobStatus.job.error}</div>}
            </div>
          )}

          <Button variant="outline" size="sm" asChild>
            <a
              href={vertexConsoleUrl(jobResult?.project_id || jobStatus?.project_id, jobResult?.location || jobStatus?.location)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Vertex AI console
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLlamaTraining;
