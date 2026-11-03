/** Up to two capital initials from a name or email ("lily.dinh@x" -> "LD"). */
export function getInitials(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
}
