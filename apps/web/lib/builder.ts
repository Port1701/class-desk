/**
 * Who built this deployment, set per deploy through public env vars. Each field
 * is null when unset or blank, and callers show nothing for a null field, so a
 * fresh copy of this template never ships placeholder text.
 *
 * Literal `process.env.NEXT_PUBLIC_*` reads, so Next.js inlines them at build
 * time.
 */
export const builder = {
  name: process.env.NEXT_PUBLIC_BUILDER_NAME?.trim() || null,
  role: process.env.NEXT_PUBLIC_BUILDER_ROLE?.trim() || null,
  email: process.env.NEXT_PUBLIC_BUILDER_EMAIL?.trim() || null,
};
