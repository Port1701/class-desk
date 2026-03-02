import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { getRedisClient, isRedisAvailable } from "@/services/redis.js";

const MAX_CONTENT_CHARS = 30_000;
const FETCH_URL_CACHE_TTL_SECONDS = 3600; // 1 hour
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
const REMOVE_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
];

export interface FetchUrlResult {
  url: string;
  title: string | null;
  content: string;
  contentLength: number;
  truncated: boolean;
  cached: boolean;
  error?: string;
}

interface CachedContent {
  title: string | null;
  content: string;
  contentLength: number;
  truncated: boolean;
  fetchedAt: number;
}

const getCacheKey = (url: string): string => {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return `fetch_url:${hash}`;
};

const getCachedContent = async (url: string): Promise<CachedContent | null> => {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const cacheKey = getCacheKey(url);
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as CachedContent;
    return parsed;
  } catch (error) {
    // Silently swallow cache read errors
    console.warn(
      `[fetchUrl] Cache read error: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
};

const setCachedContent = async (url: string, data: CachedContent): Promise<void> => {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    const redis = getRedisClient();
    if (!redis) return;

    const cacheKey = getCacheKey(url);
    // Fire-and-forget: don't await, swallow errors
    void redis.setex(cacheKey, FETCH_URL_CACHE_TTL_SECONDS, JSON.stringify(data)).catch(() => {
      // Silently swallow cache write errors
    });
  } catch (error) {
    // Outer try-catch shouldn't be needed, but safe fallback
    console.warn(
      `[fetchUrl] Cache write error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const extractTextFromHtml = (html: string): { title: string | null; content: string } => {
  const $ = cheerio.load(html);

  // Extract title
  const title = $("title").text().trim() || null;

  // Remove unwanted tags
  REMOVE_TAGS.forEach((tag) => {
    $(tag).remove();
  });

  // Extract text content
  const content = $("body").text().trim();

  // Collapse excessive whitespace
  const collapsed = content
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return { title, content: collapsed };
};

export const fetchUrl = async (url: string): Promise<FetchUrlResult> => {
  // Check cache first
  const cached = await getCachedContent(url);
  if (cached) {
    return {
      url,
      title: cached.title,
      content: cached.content,
      contentLength: cached.contentLength,
      truncated: cached.truncated,
      cached: true,
    };
  }

  try {
    // Fetch the URL with timeout
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "ClassDesk/1.0 (AI Assistant)",
      },
      redirect: "follow",
    });

    // Check for HTTP errors
    if (!response.ok) {
      return {
        url,
        title: null,
        content: "",
        contentLength: 0,
        truncated: false,
        cached: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Validate Content-Type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return {
        url,
        title: null,
        content: "",
        contentLength: 0,
        truncated: false,
        cached: false,
        error: `Unsupported content type: ${contentType}`,
      };
    }

    // Read response body
    const html = await response.text();

    // Extract text from HTML
    const { title, content } = extractTextFromHtml(html);

    // Truncate if necessary
    let truncated = false;
    let finalContent = content;
    if (content.length > MAX_CONTENT_CHARS) {
      finalContent = `${content.slice(0, MAX_CONTENT_CHARS)}\n[Content truncated]`;
      truncated = true;
    }

    // Cache the result
    const cacheData: CachedContent = {
      title,
      content: finalContent,
      contentLength: finalContent.length,
      truncated,
      fetchedAt: Date.now(),
    };
    await setCachedContent(url, cacheData);

    return {
      url,
      title,
      content: finalContent,
      contentLength: finalContent.length,
      truncated,
      cached: false,
    };
  } catch (error) {
    // Handle specific error types
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        url,
        title: null,
        content: "",
        contentLength: 0,
        truncated: false,
        cached: false,
        error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`,
      };
    }

    // Check for DNS errors (wrapped in TypeError by Node's fetch)
    if (
      error instanceof TypeError &&
      error.cause instanceof Error &&
      "code" in error.cause &&
      error.cause.code === "ENOTFOUND"
    ) {
      return {
        url,
        title: null,
        content: "",
        contentLength: 0,
        truncated: false,
        cached: false,
        error: `Could not resolve hostname for URL`,
      };
    }

    // Check for HTTPS certificate errors (wrapped in TypeError by Node's fetch)
    if (
      error instanceof TypeError &&
      error.cause instanceof Error &&
      (error.cause.message.includes("certificate") || error.cause.message.includes("CERT"))
    ) {
      return {
        url,
        title: null,
        content: "",
        contentLength: 0,
        truncated: false,
        cached: false,
        error: `HTTPS certificate validation failed`,
      };
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      url,
      title: null,
      content: "",
      contentLength: 0,
      truncated: false,
      cached: false,
      error: `Failed to fetch URL: ${errorMessage}`,
    };
  }
};
