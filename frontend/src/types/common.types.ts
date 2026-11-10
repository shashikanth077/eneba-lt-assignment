/** A failed API call in a form that can live in the Redux store (plain data: no Error instances, no Axios objects). */
export interface SerializedApiError {
  /** HTTP status, or 0 when no answer arrived (network down, timeout). */
  status: number;
  /** The backend's error code ("invalid_credentials", "out_of_stock"), or "network_error" / "timeout". */
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
