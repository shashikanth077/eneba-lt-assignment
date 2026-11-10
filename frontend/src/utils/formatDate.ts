export const formatDateTime = (iso: string): string => new Date(iso).toLocaleString();
export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
