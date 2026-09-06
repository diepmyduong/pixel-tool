import { SOURCE_ASPECT_RATIO } from "./grid";

const API_BASE = "https://viettheo.site/api/api-media";

function apiKey(): string {
  const key = import.meta.env.VITE_SPRITE_API_KEY;
  if (!key) {
    throw new Error(
      "VITE_SPRITE_API_KEY is not set. Copy .env.example to .env and fill in your key.",
    );
  }
  return key;
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text
    ? `${res.status} ${res.statusText}: ${text}`
    : `${res.status} ${res.statusText}`;
}

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

interface JobCreateResponse {
  success: boolean;
  jobId: string;
  status: JobStatus;
  message?: string;
}

interface GeneratedImage {
  imageUrl: string;
  mediaId: string;
  flow2RequestId: string;
  mimeType: string;
}

interface JobResultResponse {
  success: boolean;
  data: {
    id: string;
    status: JobStatus;
    progress: number;
    resultData?: { images?: GeneratedImage[] };
    errorMessage?: string | null;
  };
}

export interface JobProgress {
  status: JobStatus;
  progress: number;
}

async function pollJob(
  jobId: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<JobResultResponse["data"]> {
  const pollIntervalMs = 10000;
  const maxAttempts = 200; // ~10 minutes

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${API_BASE}/job/${jobId}`, {
      headers: { "x-api-key": apiKey() },
    });
    if (!res.ok) {
      throw new Error(`Job status request failed: ${await errorDetail(res)}`);
    }
    const body: JobResultResponse = await res.json();
    onProgress?.({ status: body.data.status, progress: body.data.progress });

    if (body.data.status === "SUCCEEDED") return body.data;
    if (body.data.status === "FAILED") {
      throw new Error(body.data.errorMessage ?? "Generation job failed");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Timed out waiting for job to complete");
}

export interface GenerateResult {
  imageUrl: string;
  flow2RequestId: string;
}

export async function generateImage(
  prompt: string,
  onProgress?: (progress: JobProgress) => void,
  images?: string[],
  aspectRatio: string = SOURCE_ASPECT_RATIO,
): Promise<GenerateResult> {
  const res = await fetch(`${API_BASE}?type=IMAGE_GENERATION`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      config: {
        aspectRatio,
        imageModel: "NANO_BANANA_PRO",
      },
      ...(images && images.length > 0 ? { images } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Generate request failed: ${await errorDetail(res)}`);
  }
  const created: JobCreateResponse = await res.json();
  const result = await pollJob(created.jobId, onProgress);
  const image = result.resultData?.images?.[0];
  if (!image) {
    throw new Error("Generation succeeded but returned no image");
  }
  return { imageUrl: image.imageUrl, flow2RequestId: image.flow2RequestId };
}

interface VideoGeneratedResult {
  videoUri: string;
}

interface VideoJobResultResponse {
  success: boolean;
  data: {
    id: string;
    status: JobStatus;
    progress: number;
    resultData?: { videoUri?: string };
    errorMessage?: string | null;
  };
}

async function pollVideoJob(
  jobId: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<VideoJobResultResponse["data"]> {
  const pollIntervalMs = 10000;
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${API_BASE}/job/${jobId}`, {
      headers: { "x-api-key": apiKey() },
    });
    if (!res.ok) {
      throw new Error(`Job status request failed: ${await errorDetail(res)}`);
    }
    const body: VideoJobResultResponse = await res.json();
    onProgress?.({ status: body.data.status, progress: body.data.progress });

    if (body.data.status === "SUCCEEDED") return body.data;
    if (body.data.status === "FAILED") {
      throw new Error(body.data.errorMessage ?? "Video generation job failed");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Timed out waiting for video job to complete");
}

export async function generateVideo(
  prompt: string,
  images: string[],
  onProgress?: (progress: JobProgress) => void,
): Promise<VideoGeneratedResult> {
  const res = await fetch(`${API_BASE}?type=VIDEO_GENERATION`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      config: {
        aspectRatio: "16:9",
        videoQuality: "lite_relaxed",
        videoMode: "component",
      },
      images,
    }),
  });
  if (!res.ok) {
    throw new Error(`Video generate request failed: ${await errorDetail(res)}`);
  }
  const created: JobCreateResponse = await res.json();
  const result = await pollVideoJob(created.jobId, onProgress);
  if (!result.resultData?.videoUri) {
    throw new Error("Video generation succeeded but returned no videoUri");
  }
  return { videoUri: result.resultData.videoUri };
}

export async function upsampleImage(
  flow2RequestId: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<string> {
  const res = await fetch(`${API_BASE}/upsample-image`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resolution: "4K", flow2RequestId }),
  });
  if (!res.ok) {
    throw new Error(`Upsample request failed: ${await errorDetail(res)}`);
  }
  const created: JobCreateResponse = await res.json();
  const result = await pollJob(created.jobId, onProgress);
  const image = result.resultData?.images?.[0];
  if (!image) {
    throw new Error("Upsample succeeded but returned no image");
  }
  return image.imageUrl;
}
