import Anthropic from "@anthropic-ai/sdk";
import { FIELDS, cleanFields } from "@/lib/identity";
import { ID_DOC_LABELS, type IdDocType } from "@/lib/profile";

// The idea log settled on Sonnet 5 for this, at roughly $0.014 a document.
const MODEL = "claude-sonnet-5";

const SYSTEM = `You read Nepali identity documents and copy the details off them.

Copy only. Never translate, never tidy up, never fill in a likely answer. If a
field is not printed on the document, answer with an empty string. A wrong
guess here is far worse than a blank, because it goes on a verification
record. Answer every field: an empty string is the right answer for anything
the document does not show.

Names and places are printed in two scripts on these documents:
  * a field ending in _np takes the Nepali (Devanagari) text exactly as printed
  * a field ending in _en takes the English text exactly as printed
If only one script is printed for a field, fill only that one and leave the
other empty. Do not transliterate one into the other.

Dates come in two calendars:
  * a field ending in _bs takes the Bikram Sambat date. Write it with western
    digits as YYYY-MM-DD, so साल २०५९ महिना ०७ गते २१ becomes 2059-07-21.
  * a field ending in _ad takes the western (Gregorian) date as YYYY-MM-DD.
Both are usually printed somewhere on the document, often on different sides.
Look at every image before deciding one is missing. If one really is missing,
work it out from the other and set the matching *_source to "converted". When
you copied it straight off the document, set *_source to "printed".

Ward numbers and document numbers keep the western digits as printed, with any
hyphens. Gender is "Male", "Female" or "Other".

Decide which field a value belongs to from the small printed label beside it,
never from where it sits on the card or from how the name sounds. On a
national identity card those labels are tiny and are printed in Nepali and
English together, for example "आमाको नाम / MOTHER'S NAME" and
"बालको नाम / FATHER'S NAME". Read the label before you copy the value.
A spouse's name is on the back of the card, not the front. If you cannot read
the label next to a name, leave that name out rather than putting it in a
field it might not belong to.

Set readable to false only when the photos are too blurred, dark or cropped to
read the main details. When you set it to false, say why in one short sentence
a person with no technical knowledge would understand.`;

type ReadResult =
  | { ok: true; fields: Record<string, string | null> }
  | { ok: false; reason: string };

/** The shape we ask Claude to answer in. Built from the field list. */
function schemaFor(docType: IdDocType) {
  const properties: Record<string, unknown> = {
    readable: {
      type: "boolean",
      description: "false when the photos cannot be read",
    },
    problem: {
      type: "string",
      description: "Why it cannot be read. Empty when readable is true.",
    },
  };

  for (const field of FIELDS[docType]) {
    properties[field] = { type: "string" };

    // Each date pair says whether the western date was printed or worked out.
    if (field.endsWith("_ad")) {
      properties[`${field}_source`] = {
        type: "string",
        enum: ["printed", "converted", ""],
      };
    }
  }

  // Every field is required, with an empty string for "not printed". Optional
  // fields are capped at 24 and these documents have more than that.
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * Send the photos to Claude and get back what is written on them. This never
 * saves anything: the supplier checks the answer first.
 */
export async function readDocument(
  docType: IdDocType,
  images: { mimeType: string; base64: string }[],
): Promise<ReadResult> {
  // An org-wide API key has to say which workspace to bill. A key made inside
  // a workspace already knows, so this stays unset for those.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(
    workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {},
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: schemaFor(docType) },
    },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mimeType as "image/jpeg" | "image/png" | "image/webp",
              data: image.base64,
            },
          })),
          {
            type: "text" as const,
            text: `These ${images.length} image(s) are one ${ID_DOC_LABELS[docType]} belonging to one person. Read the details off them.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") {
    // A refusal, or the answer was cut short before it was finished.
    return { ok: false, reason: "We could not read this document." };
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  let answer: Record<string, unknown>;
  try {
    answer = JSON.parse(text);
  } catch {
    return { ok: false, reason: "We could not read this document." };
  }

  if (answer.readable === false) {
    const problem = typeof answer.problem === "string" ? answer.problem : "";
    return {
      ok: false,
      reason: problem || "The photos are not clear enough to read.",
    };
  }

  return { ok: true, fields: cleanFields(docType, answer) };
}
