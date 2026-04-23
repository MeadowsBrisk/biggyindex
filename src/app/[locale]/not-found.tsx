export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="text-xl font-semibold text-foreground">Page not found</h2>
      <p className="max-w-md text-sm text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <a
        href="/browse"
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Browse items
      </a>
    </div>
  );
}
