import { Sparkles } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import type { Product } from '../../../types/api';

export interface ProductForecastTabProps {
  product: Product;
}

export function ProductForecastTab({ product }: ProductForecastTabProps) {
  return (
    <Card>
      <CardHeader
        title="AI Demand Forecast"
        description={`Demand telemetry and seasonal indicators for ${product.name} (${product.base_uom_code}).`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Model: Unavailable</Badge>
            <Badge variant="warning">Seasonal indicator: Unavailable</Badge>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="ai" title="Awaiting Brain telemetry">
          Awaiting Brain telemetry — forecast series and seasonal indicators
          (flu/Ramadan) remain Unavailable until connected.
        </Alert>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span
              className="bg-primary inline-block h-0.5 w-5"
              aria-hidden="true"
            />
            <span className="text-body-sm text-text-secondary font-medium">
              Actual history (Unavailable)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="border-ai inline-block h-0.5 w-5 border-t-2 border-dashed"
              aria-hidden="true"
            />
            <span className="text-body-sm text-text-secondary font-medium">
              Predicted demand (Unavailable)
            </span>
          </div>
        </div>

        <section
          aria-label={`AI demand forecast frame for ${product.name}`}
          className="border-border bg-background/60 flex min-h-52 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center"
        >
          <span className="bg-ai-soft text-ai flex h-10 w-10 items-center justify-center rounded-full">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-body text-text font-semibold">
            Forecast series unavailable
          </p>
          <p className="text-body-sm text-text-muted max-w-md">
            Actual demand history, predicted demand bounds, and seasonal
            indicators (flu / Ramadan) are not populated in Stage 1.
          </p>
        </section>
      </div>
    </Card>
  );
}
