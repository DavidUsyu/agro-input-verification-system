'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="status-page"><h1>We couldn&apos;t load this page.</h1><p>The service may be temporarily unavailable. Please try again.</p><button className="button" onClick={reset}>Try again</button></main>;
}
