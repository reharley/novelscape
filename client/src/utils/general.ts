export const apiUrl = import.meta.env.VITE_API_URL as string;
export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}
