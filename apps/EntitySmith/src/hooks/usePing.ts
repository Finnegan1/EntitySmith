import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PingResponse {
  status: string;
  version: string;
}

/** Confirms the Tauri backend is reachable and returns the app version. */
export function usePing() {
  const [response, setResponse] = useState<PingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<PingResponse>("ping")
      .then(setResponse)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, []);

  return { response, error };
}
