// src/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./index.css";
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script type="module" dangerouslySetInnerHTML={{ __html: `
          import EmbeddedPageSdk from "https://app.realeye.io/sdk/js/testRunnerEmbeddableSdk-1.10.0.js";
          window.reSdk = new EmbeddedPageSdk(false, null, false, false);
        `}} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}