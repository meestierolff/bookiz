import { BookizError } from '../errors.ts';

export type Category = {
  key: string;
  label: string;
  /** Only partly deductible for income tax (rule `beperkt_aftrekbaar_pct`). */
  limited: boolean;
  /** False where the law excludes the btw from deduction (rule `btw_horeca_niet_aftrekbaar`). */
  vat_deductible: boolean;
  examples: string;
};

/** Deliberately short: a small service business does not need a chart of accounts. */
export const CATEGORIES: Category[] = [
  { key: 'kantoor', label: 'Kantoorkosten', limited: false, vat_deductible: true, examples: 'papier, postzegels, kleine apparatuur, flexplek' },
  { key: 'software', label: 'Software en abonnementen', limited: false, vat_deductible: true, examples: 'SaaS, domeinnaam, hosting, AI-abonnement' },
  { key: 'telefoon_internet', label: 'Telefoon en internet', limited: false, vat_deductible: true, examples: 'alleen het zakelijke deel' },
  { key: 'reiskosten', label: 'Reiskosten', limited: false, vat_deductible: true, examples: 'trein, parkeren, taxi; eigen auto via kind "mileage"' },
  { key: 'opleiding', label: 'Opleiding en vakliteratuur', limited: false, vat_deductible: true, examples: 'cursus, boeken voor het vak' },
  { key: 'verzekering', label: 'Zakelijke verzekeringen', limited: false, vat_deductible: true, examples: 'beroepsaansprakelijkheid; geen arbeidsongeschiktheidsverzekering' },
  { key: 'marketing', label: 'Marketing', limited: false, vat_deductible: true, examples: 'advertenties, website, drukwerk' },
  { key: 'advies', label: 'Advies en administratie', limited: false, vat_deductible: true, examples: 'boekhouder, jurist, Bookiz' },
  { key: 'bankkosten', label: 'Bankkosten', limited: false, vat_deductible: true, examples: 'zakelijke rekening, betaalprovider' },
  { key: 'representatie', label: 'Representatie, congressen en seminars', limited: true, vat_deductible: true, examples: 'relatiegeschenk, congres, zakelijke lunch die je zelf inkoopt' },
  { key: 'eten_drinken_horeca', label: 'Eten en drinken in de horeca', limited: true, vat_deductible: false, examples: 'zakelijke lunch of diner in restaurant of café' },
  { key: 'overig', label: 'Overige zakelijke kosten', limited: false, vat_deductible: true, examples: 'alles wat nergens anders past' },
];

export function categoryFor(key: string): Category {
  const category = CATEGORIES.find((candidate) => candidate.key === key);
  if (!category) {
    throw new BookizError(`Onbekende categorie "${key}".`, `Kies uit: ${CATEGORIES.map((c) => c.key).join(', ')}.`);
  }
  return category;
}
