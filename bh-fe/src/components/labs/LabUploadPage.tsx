import { useCallback, useState } from 'react';
import { Beaker } from 'lucide-react';

import LabUpload from '../onboarding/LabUpload';
import LabUploadHistory from './LabUploadHistory';

export default function LabUploadPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6" data-testid="view-labUpload">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 text-steel text-sm font-semibold mb-4">
            <Beaker className="w-4 h-4" />
            <span>Lab Data</span>
          </div>
          <h1 className="mb-3 text-4xl font-semibold text-ink">Upload & Track Lab Reports</h1>
          <p className="text-lg text-steel max-w-3xl mx-auto">
            Drop PDFs, CSV exports, or high-resolution images. BioHax automatically parses 150+ biomarkers, validates with
            dual-engine AI, and pushes insights directly into your dashboard.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="neo-card p-8">
            <LabUpload onUploadComplete={handleUploadComplete} />
          </div>
          <LabUploadHistory refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}

