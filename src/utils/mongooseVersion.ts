/** Concurrent `save()` on the same doc bumps `__v` — second writer gets VersionError. */
export function isMongooseVersionError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "VersionError";
}
