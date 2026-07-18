import { lazy, Suspense, useEffect, useState } from "react";
import type { MapVendor } from "./VendorMap.client";

const VendorMap = lazy(() => import("./VendorMap.client"));

export function ClientMap({ vendors }: { vendors: MapVendor[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-full w-full animate-pulse bg-muted" />;
  return (
    <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
      <VendorMap vendors={vendors} />
    </Suspense>
  );
}
