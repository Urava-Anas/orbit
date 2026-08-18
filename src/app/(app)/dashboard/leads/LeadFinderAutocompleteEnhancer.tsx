"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const NICHE_SUGGESTIONS = [
  "Restaurant",
  "Fast Food",
  "Cafe",
  "Coffee Shop",
  "Bakery",
  "Catering",
  "Hotel",
  "Guest House",
  "Real Estate Agency",
  "Property Dealer",
  "Immigration Consultant",
  "Visa Consultant",
  "Business Consultant",
  "Law Firm",
  "Lawyer",
  "Accountant",
  "Tax Consultant",
  "Marketing Agency",
  "Advertising Agency",
  "Creative Agency",
  "Software Company",
  "IT Company",
  "Web Development Agency",
  "Travel Agency",
  "Tour Operator",
  "School",
  "College",
  "University",
  "Academy",
  "Training Institute",
  "Hospital",
  "Clinic",
  "Doctor",
  "Dentist",
  "Pharmacy",
  "Gym",
  "Fitness Studio",
  "Yoga Studio",
  "Supermarket",
  "Grocery Store",
  "Clothing Store",
  "Electronics Store",
  "Furniture Store",
  "Salon",
  "Beauty Salon",
  "Barber Shop",
  "Car Dealer",
  "Auto Repair",
  "Construction Company",
  "Architect",
  "Interior Designer",
  "Event Planner",
  "Photographer",
  "Printing Service",
  "Logistics Company",
  "Courier Service",
  "Recruitment Agency",
  "Insurance Agency",
  "Financial Consultant",
] as const;

type Suggestion = {
  id: string;
  label: string;
  secondary?: string | null;
};

type Cleanup = () => void;

function currentNicheToken(value: string) {
  const separator = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"), value.lastIndexOf("\n"));
  return value.slice(separator + 1).trim();
}

function replaceCurrentNicheToken(value: string, suggestion: string) {
  const separator = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"), value.lastIndexOf("\n"));
  if (separator < 0) return suggestion;
  const prefix = value.slice(0, separator + 1).replace(/\s*$/, "");
  return `${prefix} ${suggestion}`;
}

function scoreNiche(candidate: string, query: string) {
  const text = candidate.toLowerCase();
  const q = query.toLowerCase();
  if (text === q) return 0;
  if (text.startsWith(q)) return 1;
  if (text.split(/\s+/).some((part) => part.startsWith(q))) return 2;
  if (text.includes(q)) return 3;
  return 99;
}

function nicheMatches(query: string): Suggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return NICHE_SUGGESTIONS.slice(0, 8).map((label) => ({ id: label, label }));
  return NICHE_SUGGESTIONS
    .map((label) => ({ label, score: scoreNiche(label, trimmed) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map(({ label }) => ({ id: label, label }));
}

function installStyles() {
  if (document.getElementById("orbit-lead-autocomplete-styles")) return;
  const style = document.createElement("style");
  style.id = "orbit-lead-autocomplete-styles";
  style.textContent = `
    .orbit-lead-autocomplete-menu{position:fixed;z-index:2147483000;display:none;overflow:hidden;border:1px solid rgba(115,141,173,.28);border-radius:12px;background:rgba(7,20,35,.985);box-shadow:0 18px 45px rgba(0,0,0,.34);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);padding:5px;}
    .orbit-lead-autocomplete-menu[data-open="true"]{display:grid;}
    .orbit-lead-autocomplete-option{appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;border:0;border-radius:8px;background:transparent;color:#dce7ef;padding:9px 10px;cursor:pointer;font:inherit;}
    .orbit-lead-autocomplete-option:hover,.orbit-lead-autocomplete-option[data-active="true"]{background:rgba(255,103,112,.12);}
    .orbit-lead-autocomplete-option strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;color:#e7eef4;}
    .orbit-lead-autocomplete-option small{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:8px;color:#7f93a7;}
    .orbit-lead-autocomplete-option em{font-style:normal;font-size:8px;color:#ff7e84;white-space:nowrap;}
    .orbit-lead-autocomplete-empty{padding:10px;color:#708398;font-size:9px;}
    .orbit-lead-autocomplete-loading{padding:9px 10px;color:#8799ac;font-size:9px;}
  `;
  document.head.appendChild(style);
}

function createMenu(input: HTMLInputElement, kind: "niche" | "place") {
  const menu = document.createElement("div");
  menu.className = "orbit-lead-autocomplete-menu";
  menu.dataset.open = "false";
  menu.setAttribute("role", "listbox");
  menu.id = `orbit-${kind}-autocomplete-${Math.random().toString(36).slice(2)}`;
  document.body.appendChild(menu);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", menu.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");
  input.spellcheck = false;
  return menu;
}

function positionMenu(input: HTMLInputElement, menu: HTMLElement) {
  const rect = input.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.width = `${Math.max(260, rect.width)}px`;
  menu.style.maxWidth = `${Math.max(260, Math.min(window.innerWidth - 16, rect.width))}px`;
}

function attachAutocomplete(input: HTMLInputElement, kind: "niche" | "place"): Cleanup {
  const menu = createMenu(input, kind);
  let suggestions: Suggestion[] = [];
  let activeIndex = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let alive = true;

  const close = () => {
    menu.dataset.open = "false";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  };

  const open = () => {
    if (!suggestions.length) return close();
    positionMenu(input, menu);
    menu.dataset.open = "true";
    input.setAttribute("aria-expanded", "true");
  };

  const choose = (suggestion: Suggestion) => {
    input.value = kind === "niche"
      ? replaceCurrentNicheToken(input.value, suggestion.label)
      : suggestion.label;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    input.focus();
  };

  const render = (items: Suggestion[], emptyMessage?: string) => {
    suggestions = items;
    activeIndex = -1;
    menu.replaceChildren();
    if (!items.length) {
      if (emptyMessage) {
        const empty = document.createElement("div");
        empty.className = "orbit-lead-autocomplete-empty";
        empty.textContent = emptyMessage;
        menu.appendChild(empty);
        positionMenu(input, menu);
        menu.dataset.open = "true";
        input.setAttribute("aria-expanded", "true");
      } else close();
      return;
    }

    items.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "orbit-lead-autocomplete-option";
      button.id = `${menu.id}-option-${index}`;
      button.setAttribute("role", "option");
      button.dataset.active = "false";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = suggestion.label;
      copy.appendChild(title);
      if (suggestion.secondary) {
        const secondary = document.createElement("small");
        secondary.textContent = suggestion.secondary;
        copy.appendChild(secondary);
      }
      const hint = document.createElement("em");
      hint.textContent = kind === "niche" ? "Add" : "Select";
      button.append(copy, hint);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => choose(suggestion));
      menu.appendChild(button);
    });
    open();
  };

  const markActive = (next: number) => {
    if (!suggestions.length) return;
    activeIndex = (next + suggestions.length) % suggestions.length;
    Array.from(menu.querySelectorAll<HTMLElement>(".orbit-lead-autocomplete-option")).forEach((node, index) => {
      node.dataset.active = String(index === activeIndex);
      node.setAttribute("aria-selected", String(index === activeIndex));
    });
    const active = menu.querySelector<HTMLElement>(`#${CSS.escape(`${menu.id}-option-${activeIndex}`)}`);
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  };

  const loadPlaceSuggestions = async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      suggestions = [];
      close();
      return;
    }
    controller?.abort();
    controller = new AbortController();
    menu.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "orbit-lead-autocomplete-loading";
    loading.textContent = "Finding places…";
    menu.appendChild(loading);
    positionMenu(input, menu);
    menu.dataset.open = "true";
    input.setAttribute("aria-expanded", "true");
    try {
      const response = await fetch(`/api/leads/autocomplete?kind=place&q=${encodeURIComponent(query)}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!alive || controller.signal.aborted) return;
      if (!response.ok) {
        render([], response.status === 409 ? "Connect Geoapify in Plugins to search places." : "Place suggestions are temporarily unavailable.");
        return;
      }
      const payload = (await response.json()) as { suggestions?: Suggestion[] };
      render(Array.isArray(payload.suggestions) ? payload.suggestions : [], "No matching places found.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (alive) render([], "Place suggestions are temporarily unavailable.");
    }
  };

  const update = () => {
    if (kind === "niche") {
      render(nicheMatches(currentNicheToken(input.value)));
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(loadPlaceSuggestions, 220);
  };

  const onFocus = () => update();
  const onInput = () => update();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (menu.dataset.open !== "true") update();
      markActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      markActive(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      close();
    }
  };
  const onDocumentPointer = (event: PointerEvent) => {
    if (event.target !== input && !menu.contains(event.target as Node)) close();
  };
  const onViewport = () => {
    if (menu.dataset.open === "true") positionMenu(input, menu);
  };

  input.addEventListener("focus", onFocus);
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onDocumentPointer);
  window.addEventListener("resize", onViewport);
  window.addEventListener("scroll", onViewport, true);

  return () => {
    alive = false;
    if (timer) clearTimeout(timer);
    controller?.abort();
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onDocumentPointer);
    window.removeEventListener("resize", onViewport);
    window.removeEventListener("scroll", onViewport, true);
    input.removeAttribute("role");
    input.removeAttribute("aria-autocomplete");
    input.removeAttribute("aria-controls");
    input.removeAttribute("aria-expanded");
    input.removeAttribute("aria-activedescendant");
    menu.remove();
  };
}

export function LeadFinderAutocompleteEnhancer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/dashboard/leads/add") return;
    installStyles();
    let cleanups: Cleanup[] = [];
    let observer: MutationObserver | null = null;
    let attachedNiche: HTMLInputElement | null = null;
    let attachedPlace: HTMLInputElement | null = null;

    const attach = () => {
      const niche = document.querySelector<HTMLInputElement>('input[name="niches"]');
      const place = document.querySelector<HTMLInputElement>('input[name="location"]');
      if (niche && niche !== attachedNiche) {
        attachedNiche = niche;
        cleanups.push(attachAutocomplete(niche, "niche"));
      }
      if (place && place !== attachedPlace) {
        attachedPlace = place;
        cleanups.push(attachAutocomplete(place, "place"));
      }
    };

    attach();
    observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      cleanups = [];
    };
  }, [pathname, searchKey]);

  return null;
}
