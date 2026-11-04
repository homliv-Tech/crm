export const APARTMENT_TYPE_VALUES = [
  "1-bhk",
  "2-bhk",
  "3-bhk",
  "4-bhk",
  "5-bhk-plus",
  "villa",
  "independent-home",
] as const;

export const BUDGET_RANGE_VALUES = [
  "under-5-lakh",
  "5-10-lakh",
  "10-20-lakh",
  "20-35-lakh",
  "35-50-lakh",
  "50-lakh-plus",
  "not-sure",
] as const;

type ApartmentType = (typeof APARTMENT_TYPE_VALUES)[number];
type BudgetRange = (typeof BUDGET_RANGE_VALUES)[number];

const apartmentLabels: Record<ApartmentType, string> = {
  "1-bhk": "1 BHK",
  "2-bhk": "2 BHK",
  "3-bhk": "3 BHK",
  "4-bhk": "4 BHK",
  "5-bhk-plus": "5 BHK+",
  villa: "Villa",
  "independent-home": "Independent home",
};

const budgetLabels: Record<BudgetRange, string> = {
  "under-5-lakh": "Under ₹5 lakh",
  "5-10-lakh": "₹5–10 lakh",
  "10-20-lakh": "₹10–20 lakh",
  "20-35-lakh": "₹20–35 lakh",
  "35-50-lakh": "₹35–50 lakh",
  "50-lakh-plus": "₹50 lakh+",
  "not-sure": "Not sure yet",
};

export const APARTMENT_TYPES = APARTMENT_TYPE_VALUES.map((value) => ({
  value,
  label: apartmentLabels[value],
}));

export const BUDGET_RANGES = BUDGET_RANGE_VALUES.map((value) => ({
  value,
  label: budgetLabels[value],
}));

export function getApartmentTypeLabel(value: string): string {
  return (
    APARTMENT_TYPES.find((option) => option.value === value)?.label ?? value
  );
}

export function getBudgetRangeLabel(value: string): string {
  return BUDGET_RANGES.find((option) => option.value === value)?.label ?? value;
}
