import { clsx } from "clsx";

export const cn = clsx;

export function debounce<T extends (...args: never[]) => void>(fn: T, delay = 300) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
