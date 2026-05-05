const extractContacts = (text: string) => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@sampoernauniversity\.ac\.id/g;
  const emails = [...text.matchAll(emailRegex)];

  const seenEmails = new Set<string>();

  return emails
    .map((match) => {
      const email = match[0];

      // 🚫 skip duplicates
      if (seenEmails.has(email)) return null;
      seenEmails.add(email);

      const index = match.index || 0;

      const contextStart = Math.max(0, index - 120);
      const context = text.slice(contextStart, index);

      const lines = context
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const name =
        lines.reverse().find(
          (line) =>
            !line.includes("@") &&
            line.length < 60 &&
            !line.toLowerCase().includes("course")
        ) || "Unknown";

      return `${name}: ${email}`;
    })
    .filter(Boolean);
};


export function compressContext(
    chunks: { content_text: string }[],
    category: string
): string {


    if (category === "Campus Directory") {
        
        return extractContacts(
            chunks.map(c => c.content_text).join("\n")
        ).join("\n");
    }

    // Default (for other categories)
    return chunks
        .map((c) => c.content_text)
        .join("\n\n---\n\n");
}