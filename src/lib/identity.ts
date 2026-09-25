import type { IdDocType } from "@/lib/profile";

/**
 * The details written on a Nepali ID document.
 *
 * Two rules run through this whole file:
 *   * Names and places are kept twice, `_np` as printed in Nepali and `_en` as
 *     printed in English. Nothing is translated, only copied. Both of these
 *     documents print both, so a blank means it was not on the paper.
 *   * Dates are kept twice, Bikram Sambat and the western date. Both are
 *     normally printed. When only one is, the other is worked out and the
 *     matching `_source` says `converted`, so the supplier is asked to check it.
 */
export type IdentityDetails = {
  profile_id: string;
  doc_type: IdDocType;

  document_number: string | null;

  full_name_en: string | null;
  full_name_np: string | null;
  surname_en: string | null;
  surname_np: string | null;
  given_name_en: string | null;
  given_name_np: string | null;

  gender: string | null;
  nationality: string | null;

  date_of_birth_bs: string | null;
  date_of_birth_ad: string | null;
  date_of_birth_ad_source: DateSource | null;

  birth_district_en: string | null;
  birth_district_np: string | null;
  birth_municipality_en: string | null;
  birth_municipality_np: string | null;
  birth_ward: string | null;

  permanent_district_en: string | null;
  permanent_district_np: string | null;
  permanent_municipality_en: string | null;
  permanent_municipality_np: string | null;
  permanent_ward: string | null;

  father_name_en: string | null;
  father_name_np: string | null;
  mother_name_en: string | null;
  mother_name_np: string | null;
  spouse_name_en: string | null;
  spouse_name_np: string | null;

  citizenship_kind_en: string | null;
  citizenship_kind_np: string | null;

  issuing_office_en: string | null;
  issuing_office_np: string | null;
  issue_date_bs: string | null;
  issue_date_ad: string | null;
  issue_date_ad_source: DateSource | null;

  confirmed_at: string;
  updated_at: string;
};

export type DateSource = "printed" | "converted";

/**
 * The details in the order a person would check them, in small groups. Name
 * first, because that is what anyone looks at first, and the fine print last.
 * This is the one list: the form, the AI and the saving all read it.
 */
type Section = { title: string; fields: string[] };

/** The groups every document shares, after its own naming fields. */
const COMMON: Section[] = [
  {
    title: "Where you live",
    fields: [
      "permanent_district_en",
      "permanent_district_np",
      "permanent_municipality_en",
      "permanent_municipality_np",
      "permanent_ward",
    ],
  },
  {
    title: "Your family",
    fields: [
      "father_name_en",
      "father_name_np",
      "mother_name_en",
      "mother_name_np",
      "spouse_name_en",
      "spouse_name_np",
    ],
  },
  {
    title: "Who issued it",
    fields: [
      "issuing_office_en",
      "issuing_office_np",
      "issue_date_bs",
      "issue_date_ad",
    ],
  },
];

export const SECTIONS: Record<IdDocType, Section[]> = {
  citizenship: [
    { title: "Your name", fields: ["full_name_en", "full_name_np"] },
    {
      title: "The document",
      fields: [
        "document_number",
        "citizenship_kind_en",
        "citizenship_kind_np",
        "gender",
        "date_of_birth_bs",
        "date_of_birth_ad",
      ],
    },
    {
      title: "Where you were born",
      fields: [
        "birth_district_en",
        "birth_district_np",
        "birth_municipality_en",
        "birth_municipality_np",
        "birth_ward",
      ],
    },
    ...COMMON,
  ],
  nid_card: [
    {
      title: "Your name",
      fields: ["given_name_en", "given_name_np", "surname_en", "surname_np"],
    },
    {
      title: "The document",
      fields: [
        "document_number",
        "nationality",
        "gender",
        "date_of_birth_bs",
        "date_of_birth_ad",
      ],
    },
    ...COMMON,
  ],
  // The paper slip is handed out while the card is not yet printed. It carries
  // the same details, just laid out differently, so we look for the same ones.
  nid_paper: [],
};

SECTIONS.nid_paper = SECTIONS.nid_card;

/** Which fields to read and save, per document. Nothing else is accepted. */
export const FIELDS: Record<IdDocType, readonly string[]> = {
  citizenship: SECTIONS.citizenship.flatMap((s) => s.fields),
  nid_card: SECTIONS.nid_card.flatMap((s) => s.fields),
  nid_paper: SECTIONS.nid_paper.flatMap((s) => s.fields),
};

/** Short words for the review screen. */
export const FIELD_LABELS: Record<string, string> = {
  document_number: "Document number",
  full_name_en: "Full name (English)",
  full_name_np: "Full name (Nepali)",
  surname_en: "Surname (English)",
  surname_np: "Surname (Nepali)",
  given_name_en: "Given name (English)",
  given_name_np: "Given name (Nepali)",
  gender: "Gender",
  nationality: "Nationality",
  date_of_birth_bs: "Date of birth (Bikram Sambat)",
  date_of_birth_ad: "Date of birth (western)",
  birth_district_en: "Birth district (English)",
  birth_district_np: "Birth district (Nepali)",
  birth_municipality_en: "Birth municipality (English)",
  birth_municipality_np: "Birth municipality (Nepali)",
  birth_ward: "Birth ward number",
  permanent_district_en: "Permanent district (English)",
  permanent_district_np: "Permanent district (Nepali)",
  permanent_municipality_en: "Permanent municipality (English)",
  permanent_municipality_np: "Permanent municipality (Nepali)",
  permanent_ward: "Permanent ward number",
  father_name_en: "Father's name (English)",
  father_name_np: "Father's name (Nepali)",
  mother_name_en: "Mother's name (English)",
  mother_name_np: "Mother's name (Nepali)",
  spouse_name_en: "Spouse's name (English)",
  spouse_name_np: "Spouse's name (Nepali)",
  citizenship_kind_en: "Citizenship type (English)",
  citizenship_kind_np: "Citizenship type (Nepali)",
  issuing_office_en: "Issuing office (English)",
  issuing_office_np: "Issuing office (Nepali)",
  issue_date_bs: "Issue date (Bikram Sambat)",
  issue_date_ad: "Issue date (western)",
};

/** Dates are a pair: the BS one as printed, and the western one. */
export const DATE_PAIRS = [
  { bs: "date_of_birth_bs", ad: "date_of_birth_ad", source: "date_of_birth_ad_source" },
  { bs: "issue_date_bs", ad: "issue_date_ad", source: "issue_date_ad_source" },
] as const;

const AD_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keep only the fields this document type has, trim them, and turn blanks into
 * null. Anything we did not ask for is dropped rather than saved.
 */
export function cleanFields(docType: IdDocType, input: Record<string, unknown>) {
  const out: Record<string, string | null> = {};

  for (const field of FIELDS[docType]) {
    const value = input[field];
    const text = typeof value === "string" ? value.trim() : "";
    out[field] = text.length > 0 ? text : null;
  }

  // A western date has to be a real yyyy-mm-dd or the database will refuse it.
  for (const pair of DATE_PAIRS) {
    if (!(pair.ad in out)) continue;
    if (out[pair.ad] && !AD_DATE.test(out[pair.ad]!)) out[pair.ad] = null;

    const source = input[pair.source];
    out[pair.source] = out[pair.ad]
      ? source === "converted"
        ? "converted"
        : "printed"
      : null;
  }

  return out;
}
